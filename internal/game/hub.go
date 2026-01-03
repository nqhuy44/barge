package game

import (
	"encoding/json"
	"fmt"
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
	CheckOrigin:     func(r *http.Request) bool { return true },
}

const (
	RoomStatusWaiting = "WAITING"
	RoomStatusPlaying = "PLAYING"
)

type Client struct {
	Hub   *Hub
	Conn  *websocket.Conn
	Send  chan []byte
	ID    string
	Room  *Room
	Name  string
}

type Room struct {
	ID        string
	Clients   map[*Client]bool
	Broadcast chan []byte
	Register  chan *Client
	Unregister chan *Client
	Hub       *Hub
	Status    string
}

func NewRoom(id string, hub *Hub) *Room {
	return &Room{
		ID:         id,
		Clients:    make(map[*Client]bool),
		Broadcast:  make(chan []byte),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		Hub:        hub,
		Status:     RoomStatusWaiting,
	}
}

func (r *Room) Run() {
	defer func() {
		r.Hub.UnregisterRoom <- r
	}()

	for {
		select {
		case client := <-r.Register:
			r.Clients[client] = true
			client.Room = r
			log.Printf("Client %s joined Room %s", client.ID, r.ID)

		case client := <-r.Unregister:
			if _, ok := r.Clients[client]; ok {
				delete(r.Clients, client)
				client.Room = nil
				log.Printf("Client %s left Room %s", client.ID, r.ID)

				// Broadcast PLAYER_LEFT to remaining clients
				leaveMsg := map[string]string{
					"type": "PLAYER_LEFT",
					"id":   client.ID,
				}
				jsonMsg, _ := json.Marshal(leaveMsg)
				
				for c := range r.Clients {
					select {
					case c.Send <- jsonMsg:
					default:
						delete(r.Clients, c)
						close(c.Send)
					}
				}

				// If empty, stop room
				if len(r.Clients) == 0 {
					return
				}
			}

		case message := <-r.Broadcast:
			for client := range r.Clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(r.Clients, client)
				}
			}
		}
	}
}

type JoinRequest struct {
	Client *Client
	RoomID string
}

type Hub struct {
	Rooms          map[string]*Room
	CreateRoom     chan *Client
	JoinRoom       chan *JoinRequest
	StartGame      chan *Client 
	UnregisterRoom chan *Room
	Mutex          sync.Mutex
	MapSeed        int64
}

func NewHub() *Hub {
	rand.Seed(time.Now().UnixNano())
	return &Hub{
		Rooms:          make(map[string]*Room),
		CreateRoom:     make(chan *Client),
		JoinRoom:       make(chan *JoinRequest),
		StartGame:      make(chan *Client),
		UnregisterRoom: make(chan *Room),
		MapSeed:        time.Now().UnixNano(),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.CreateRoom:
			h.Mutex.Lock()
			// Generate 6-digit ID
			roomId := fmt.Sprintf("%06d", rand.Intn(1000000))
			for h.Rooms[roomId] != nil {
				roomId = fmt.Sprintf("%06d", rand.Intn(1000000))
			}
			
			room := NewRoom(roomId, h)
			h.Rooms[roomId] = room
			go room.Run()
			
			// Send echo to creator to confirm creation
			msg := map[string]interface{}{
				"type": "CREATE_ROOM",
				"id": client.ID, 
				"name": client.Name, // Use stored name
				"roomId": roomId,
			}
			jsonMsg, _ := json.Marshal(msg)
			client.Send <- jsonMsg

			// Register client to new room
			room.Register <- client
			h.Mutex.Unlock()

		case req := <-h.JoinRoom:
			h.Mutex.Lock()
			if room, ok := h.Rooms[req.RoomID]; ok {
				// CHECK STATUS
				if room.Status != RoomStatusWaiting {
					msg := map[string]interface{}{
						"type": "ERROR",
						"message": "Game already started",
					}
					jsonMsg, _ := json.Marshal(msg)
					req.Client.Send <- jsonMsg
				} else {
					room.Register <- req.Client
					 msg := map[string]interface{}{
						"type": "JOIN_ROOM",
						"id": req.Client.ID,
						"name": req.Client.Name, // Use stored name
						"roomId": req.RoomID,
						"success": true,
					}
					jsonMsg, _ := json.Marshal(msg)
					room.Broadcast <- jsonMsg
				}
			} else {
				// Send fail
				msg := map[string]interface{}{
					"type": "ERROR",
					"message": "Room not found",
				}
				jsonMsg, _ := json.Marshal(msg)
				req.Client.Send <- jsonMsg
			}
			h.Mutex.Unlock()
			
		case client := <-h.StartGame:
			h.Mutex.Lock()
			if client.Room != nil {
				if room, ok := h.Rooms[client.Room.ID]; ok {
					room.Status = RoomStatusPlaying
					log.Printf("Room %s status set to PLAYING", room.ID)
					
					msg := map[string]interface{}{
						"type": "GAME_START",
						"id": client.ID,
						"seed": h.MapSeed, 
					}
					jsonMsg, _ := json.Marshal(msg)
					room.Broadcast <- jsonMsg
				}
			}
			h.Mutex.Unlock()

		case room := <-h.UnregisterRoom:
			h.Mutex.Lock()
			if _, ok := h.Rooms[room.ID]; ok {
				delete(h.Rooms, room.ID)
				log.Printf("Room %s deleted (empty)", room.ID)
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

	// Unique ID generation: Time + Random
	clientID := fmt.Sprintf("%d-%d", time.Now().UnixNano(), rand.Intn(10000))

	client := &Client{
		Hub:  hub,
		Conn: conn,
		Send: make(chan []byte, 256),
		ID:   clientID,
	}

	// Send WELCOME
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
		if c.Room != nil {
			c.Room.Unregister <- c
		}
		c.Conn.Close()
	}()
	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}
		
		var msgMap map[string]interface{}
		if err := json.Unmarshal(message, &msgMap); err != nil {
			log.Printf("Error unmarshalling: %v", err)
			continue
		}

		typeStr, _ := msgMap["type"].(string)
		
		// Parse Name if present
		if name, ok := msgMap["name"].(string); ok {
			c.Name = name
		}

		switch typeStr {
		case "CREATE_ROOM":
			c.Hub.CreateRoom <- c
		
		case "JOIN_ROOM":
			roomId, _ := msgMap["roomId"].(string)
			c.Hub.JoinRoom <- &JoinRequest{Client: c, RoomID: roomId}
		
		case "GAME_START":
			c.Hub.StartGame <- c

		default:
			// Forward to room
			if c.Room != nil {
				c.Room.Broadcast <- message
			}
		}
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
