package game

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/nqhuy44/barge/internal/config"
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
	Hub            *Hub
	Conn           *websocket.Conn
	Send           chan []byte
	ID             string
	Room           *Room
	Name           string
	LastAttackerID string
	LastHitTime    int64
	Score          int
	IsDead         bool
}

type Room struct {
	ID        string
	Clients   map[*Client]bool
	Broadcast chan []byte
	Register  chan *Client
	Unregister chan *Client
	Hub       *Hub
	Status    string
	GameTimer *time.Timer
}

type PlayerScore struct {
	Name  string `json:"name"`
	Score int    `json:"score"`
}

func (r *Room) endGame() {
	r.Status = RoomStatusWaiting
	if r.GameTimer != nil {
		r.GameTimer.Stop()
	}

	// 1. Collect Scores
	var scores []PlayerScore
	for client := range r.Clients {
		scores = append(scores, PlayerScore{
			Name:  client.Name,
			Score: client.Score,
		})
	}

	// 2. Sort Descending
	sort.Slice(scores, func(i, j int) bool {
		return scores[i].Score > scores[j].Score
	})

	// 3. Determine Winner
	winnerName := "Nobody"
	// winnerColor := "#000" // Backend doesn't store color yet
	if len(scores) > 0 {
		winnerName = scores[0].Name
	}

	// 4. Broadcast GAME_OVER
	msg := map[string]interface{}{
		"type":        "GAME_OVER",
		"winnerName":  winnerName,
		"leaderboard": scores,
	}
	jsonMsg, _ := json.Marshal(msg)
	r.Broadcast <- jsonMsg
	
	log.Printf("Room %s GAME OVER. Winner: %s", r.ID, winnerName)
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
	Config         *config.Config
}

func NewHub(cfg *config.Config) *Hub {
	rand.Seed(time.Now().UnixNano())
	return &Hub{
		Rooms:          make(map[string]*Room),
		CreateRoom:     make(chan *Client),
		JoinRoom:       make(chan *JoinRequest),
		StartGame:      make(chan *Client),
		UnregisterRoom: make(chan *Room),
		MapSeed:        rand.Int63n(100000), // Secure 32-bit range for JS
		Config:         cfg,
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
					
					// Flexible game duration
					duration := time.Duration(h.Config.GameDuration) * time.Second

					// Dynamic Map Radius Calculation
					// Formula: Base + (Players - 1) * Step
					playerCount := len(room.Clients)
					
					// Use Config Values
					baseRadius := h.Config.BaseRadius
					radiusStep := h.Config.RadiusStep
					
					mapRadius := baseRadius + (float64(playerCount)-1.0)*radiusStep
					if mapRadius < baseRadius {
						mapRadius = baseRadius
					}
					
					// Generate Fresh Seed for this Match
					matchSeed := rand.Int63n(100000)
					
					log.Printf("Starting Game: Players=%d, Radius=%.2f, Seed=%d", playerCount, mapRadius, matchSeed)

					msg := map[string]interface{}{
						"type":      "GAME_START",
						"id":        client.ID,
						"seed":      matchSeed,
						"duration":  h.Config.GameDuration, // Send int seconds to client
						"mapRadius": mapRadius,
					}
					jsonMsg, _ := json.Marshal(msg)
					room.Broadcast <- jsonMsg

					// Start Timer
					if room.GameTimer != nil {
						room.GameTimer.Stop()
					}
					room.GameTimer = time.AfterFunc(duration, func() {
						room.endGame()
					})
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

		case "HIT":
			// Received from Attacker: { type: "HIT", targetId: "xyz" }
			if c.Room == nil {
				continue
			}
			targetId, _ := msgMap["targetId"].(string)
			
			// Find Target in Room (Linear search for now, could be map)
			for target := range c.Room.Clients {
				if target.ID == targetId {
					// Register Hit
					target.LastAttackerID = c.ID
					target.LastHitTime = time.Now().UnixMilli() // Milliseconds
					// fmt.Printf("Hit Registered: %s -> %s at %d\n", c.Name, target.Name, target.LastHitTime)
					break
				}
			}

		case "DEATH":
			// Received from Victim: { type: "DEATH" }
			if c.Room == nil || c.IsDead {
				continue
			}
			c.IsDead = true
			
			// CHECK KILL CONDITION
			now := time.Now().UnixMilli()
			timeDiff := now - c.LastHitTime
			
			var killerName string = ""
			var killerScore int = 0
			var feedType string = "suicide"
			
			// 5.0 Second Window (5000ms)
			log.Printf("Death check: LastAttacker=%s, TimeDiff=%dms", c.LastAttackerID, timeDiff)
			if c.LastAttackerID != "" && timeDiff <= 5000 {
				// FIND KILLER
				for attacker := range c.Room.Clients {
					if attacker.ID == c.LastAttackerID {
						attacker.Score++
						killerName = attacker.Name
						killerScore = attacker.Score
						feedType = "shove"
						break
					}
				}
			}
			
			// Broadcast KILL_FEED
			feedMsg := map[string]interface{}{
				"type": "KILL_FEED",
				"killer": killerName,
				"victim": c.Name,
				"feedType": feedType,
				"killerScore": killerScore,
			}
			jsonFeed, _ := json.Marshal(feedMsg)
			c.Room.Broadcast <- jsonFeed
			
			// Reset Hit State
			c.LastAttackerID = ""
			
			// RESPAWN LOGIC
			respawnSeconds := 5
			
			// 1. Send YOU_DIED to Victim
			msgDied := map[string]interface{}{
				"type": "YOU_DIED",
				"respawnIn": respawnSeconds,
			}
			jsonDied, _ := json.Marshal(msgDied)
			
			select {
			case c.Send <- jsonDied:
			default:
			}

			// 2. Start Timer Goroutine
			go func(client *Client) {
				defer func() {
					if r := recover(); r != nil {
						// Client disconnected
					}
				}()

				time.Sleep(time.Duration(respawnSeconds) * time.Second)
				
				// 3. Send RESPAWN_NOW
				// Randomized spawn around center (-10 to 10)
				rx := (rand.Float64() * 20) - 10
				rz := (rand.Float64() * 20) - 10
				
				msgRespawn := map[string]interface{}{
					"type": "RESPAWN_NOW",
					"x": rx,
					"y": 5.0,
					"z": rz,
				}
				jsonResp, _ := json.Marshal(msgRespawn)
				
				client.Send <- jsonResp
			}(c)

		case "STATE":
			// 1. Reset IsDead if back on stage
			y, _ := msgMap["y"].(float64)
			if y > 0 {
				c.IsDead = false
			}

			// 2. Forward Message
			if c.Room != nil {
				c.Room.Broadcast <- message
			}

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
	for message := range c.Send {
		w, err := c.Conn.NextWriter(websocket.TextMessage)
		if err != nil {
			return
		}
		w.Write(message)
		if err := w.Close(); err != nil {
			return
		}
	}
	c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
}
