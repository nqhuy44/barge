package game

import (
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Client struct {
	Hub  *Hub
	Conn *websocket.Conn
	Send chan []byte
	ID   string
}

type Hub struct {
	Clients    map[*Client]bool
	Broadcast  chan []byte
	Register   chan *Client
	Unregister chan *Client
	Mutex      sync.Mutex
	MapSeed    int64
}

func NewHub() *Hub {
	seed := time.Now().UnixNano()
	rand.Seed(seed) // Global seed (deprecated in newer Go but fine for now) or just use MapSeed directly
	
	return &Hub{
		Broadcast:  make(chan []byte),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		Clients:    make(map[*Client]bool),
		MapSeed:    seed,
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.Mutex.Lock()
			h.Clients[client] = true
			h.Mutex.Unlock()
			log.Printf("Client registered: %s", client.ID)

		case client := <-h.Unregister:
			h.Mutex.Lock()
			if _, ok := h.Clients[client]; ok {
				delete(h.Clients, client)
				close(client.Send)
				log.Printf("Client unregistered: %s", client.ID)

				// NEW: Broadcast PLAYER_LEFT
				leaveMsg := map[string]string{
					"type": "PLAYER_LEFT",
					"id":   client.ID,
				}
				jsonMsg, _ := json.Marshal(leaveMsg)

				// Broadcast to remaining clients
				for remainingClient := range h.Clients {
					select {
					case remainingClient.Send <- jsonMsg:
					default:
						close(remainingClient.Send)
						delete(h.Clients, remainingClient)
					}
				}
			}
			h.Mutex.Unlock()

		case message := <-h.Broadcast:
			h.Mutex.Lock()
			for client := range h.Clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(h.Clients, client)
				}
			}
			h.Mutex.Unlock()
		}
	}
}

func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	clientID := r.RemoteAddr
	client := &Client{Hub: hub, Conn: conn, Send: make(chan []byte, 256), ID: clientID}
	client.Hub.Register <- client

	// Send WELCOME message
	welcomeMsg := map[string]interface{}{
		"type": "WELCOME",
		"id":   clientID,
		"seed": hub.MapSeed,
	}
	jsonMsg, _ := json.Marshal(welcomeMsg)
	client.Send <- jsonMsg

	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()
	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}
		c.Hub.Broadcast <- message
	}
}

func (c *Client) writePump() {
	defer func() {
		c.Conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.Send:
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)
			if err := w.Close(); err != nil {
				return
			}
		}
	}
}
