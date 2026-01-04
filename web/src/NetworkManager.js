export class NetworkManager {
  constructor() {
    this.playerId = "Player_" + Math.floor(Math.random() * 10000);
    this.socket = null;
    this.messageHandler = null;

    // Lobby State
    this.currentRoomId = null;
    this.isHost = false;
    this.players = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        resolve(); // Already connected
        return;
      }

      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      // Use relative host (Vite Proxy or Nginx will handle routing to backend)
      const host = window.location.host;

      this.socket = new WebSocket(`${protocol}://${host}/ws`);

      this.socket.onopen = () => {
        console.log(`✅ Socket Open. Waiting for Welcome...`);
      };

      this.socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "WELCOME":
            console.log("✅ Connected. ID:", data.id);
            this.playerId = data.id;
            resolve();
            break;

          case "ROOM_JOINED":
            console.log("🏠 Room Joined:", data.roomId);
            if (this.roomJoinedCallback) {
              this.roomJoinedCallback(data);
            }
            break;

          case "ERROR":
            console.error("❌ Network Error:", data.message);
            if (this.errorCallback) {
              this.errorCallback(data.message);
            }
            break;

          case "LOBBY_UPDATE":
            if (this.lobbyUpdateCallback) {
              this.lobbyUpdateCallback(data.players);
            }
            break;

          case "CHAT_MESSAGE":
            if (this.chatMessageCallback) {
              this.chatMessageCallback(data);
            }
            break;

          case "GAME_START":
            console.log("🚀 Game Started! Seed:", data.seed);
            if (this.gameStartCallback) {
              this.gameStartCallback(data);
            }
            break;

          // --- PROTOTYPE: Handle Echoed Packets ---
          // --- PROTOTYPE: Handler Echoed Packets (Simulated Lobby) ---
          case "CREATE_ROOM":
            // 1. Host Logic: If I created it, I am host
            if (data.id === this.playerId) {
              this.currentRoomId = data.roomId;
              this.isHost = true;

              // Init Player List (Host is Ready)
              this.players = [
                {
                  id: this.playerId,
                  name: data.name,
                  isHost: true,
                  isReady: true,
                  color:
                    "#" + Math.floor(Math.random() * 16777215).toString(16),
                },
              ];

              if (this.roomJoinedCallback) {
                this.roomJoinedCallback({
                  roomId: this.currentRoomId,
                  isHost: true,
                });
              }

              // Broadcast Initial Update
              this.broadcastLobbyUpdate();
            }
            break;

          case "JOIN_ROOM":
            // 2. Host Logic: Handle others joining
            if (
              this.isHost &&
              data.roomId === this.currentRoomId &&
              data.id !== this.playerId
            ) {
              // Add new player (Default Status: Waiting)
              const newPlayer = {
                id: data.id,
                name: data.name,
                isHost: false,
                isReady: false,
                color: "#ccc",
              };
              // Prevent duplicates
              if (!this.players.find((p) => p.id === newPlayer.id)) {
                this.players.push(newPlayer);
                this.broadcastLobbyUpdate();
              }
            }

            // 3. Client Logic: If I joined
            if (data.id === this.playerId) {
              this.currentRoomId = data.roomId;
              this.isHost = false;
              if (this.roomJoinedCallback) {
                this.roomJoinedCallback({
                  roomId: data.roomId,
                  isHost: false,
                });
              }
            }
            break;

          case "PLAYER_READY":
            if (this.isHost) {
              const p = this.players.find((player) => player.id === data.id);
              if (p) {
                p.isReady = data.isReady;
                this.broadcastLobbyUpdate();
              }
            }
            break;

          case "PLAYER_UPDATE":
            if (this.isHost) {
              const p = this.players.find((player) => player.id === data.id);
              if (p) {
                p.color = data.color;
                this.broadcastLobbyUpdate();
              }
            }
            break;

          case "LOBBY_UPDATE":
            // Clients receive update from Host
            if (!this.isHost && data.roomId === this.currentRoomId) {
              // console.log("Network: LOBBY_UPDATE received", data.players);
              // console.log("Network: My ID:", this.playerId);
              if (this.lobbyUpdateCallback) {
                const localList = data.players.map((p) => {
                  const isLocal = p.id === this.playerId;
                  console.log(
                    `[DEBUG] Check ID: ${p.id} vs MyID: ${
                      this.playerId
                    } => ${isLocal} (Types: ${typeof p.id} vs ${typeof this
                      .playerId})`
                  );
                  return {
                    ...p,
                    isLocal: isLocal,
                  };
                });
                this.lobbyUpdateCallback(localList);
              }
            }
            break;

          default:
            // Game State Updates (STATE, DISCONNECT, etc.)
            if (this.messageHandler) {
              if (data.id !== this.playerId) {
                this.messageHandler(data);
              }
            }
            break;
        }
      };

      this.socket.onerror = (error) => {
        console.error("WebSocket Error:", error);
        // reject(error); // Optional: reject if initial connection fails
      };
    });
  }

  onMessage(callback) {
    this.messageHandler = callback;
  }

  onGameStart(callback) {
    this.gameStartCallback = callback;
  }

  sendState(position, rotation, velocity, color) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const packet = {
        id: this.playerId,
        type: "STATE",
        color: color,
        x: position.x,
        y: position.y,
        z: position.z,
        rx: rotation.x,
        ry: rotation.y,
        rz: rotation.z,
        rw: rotation.w,
        vx: velocity.x,
        vy: velocity.y,
        vz: velocity.z,
      };
      this.socket.send(JSON.stringify(packet));
    }
  }

  sendPlayerUpdate(color) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: "PLAYER_UPDATE",
          id: this.playerId,
          color: color,
        })
      );
    }
  }

  sendReady(isReady) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: "PLAYER_READY",
          id: this.playerId,
          isReady: isReady,
        })
      );
    }
  }

  sendStartGame() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: "GAME_START",
          id: this.playerId,
        })
      );
    }
  }

  sendChat(message) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: "CHAT_MESSAGE",
          id: this.playerId,
          name: this.playerName || "Unknown",
          message: message,
        })
      );
    }
  }

  onLobbyUpdate(callback) {
    this.lobbyUpdateCallback = callback;
  }

  onChatMessage(callback) {
    this.chatMessageCallback = callback;
  }

  onRoomJoined(callback) {
    this.roomJoinedCallback = callback;
  }

  onError(callback) {
    this.errorCallback = callback;
  }

  // --- NEW ACTIONS ---
  sendCreateRoom(name) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.playerName = name;
      this.socket.send(
        JSON.stringify({
          type: "CREATE_ROOM",
          id: this.playerId,
          name: name,
        })
      );
    }
  }

  sendHit(targetId) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: "HIT",
          id: this.playerId,
          targetId: targetId,
        })
      );
    }
  }

  sendDeath() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: "DEATH",
          id: this.playerId,
        })
      );
    }
  }

  sendJoinRoom(name, roomId) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.playerName = name;
      this.socket.send(
        JSON.stringify({
          type: "JOIN_ROOM",
          id: this.playerId,
          name: name,
          roomId: roomId,
        })
      );
    }
  }

  broadcastLobbyUpdate() {
    if (this.socket && this.isHost) {
      this.socket.send(
        JSON.stringify({
          type: "LOBBY_UPDATE",
          roomId: this.currentRoomId,
          players: this.players,
        })
      );

      // Local Update for Host
      if (this.lobbyUpdateCallback) {
        const localList = this.players.map((p) => {
          const isLocal = p.id === this.playerId;
          console.log(
            `[DEBUG HOST] Check ID: ${p.id} vs MyID: ${this.playerId} => ${isLocal}`
          );
          return {
            ...p,
            isLocal: isLocal,
          };
        });
        this.lobbyUpdateCallback(localList);
      }
    }
  }

  // Also need to handle Player Updates (Color, Ready)
  // Host updates local state then broadcasts.
  // Clients send "PLAYER_UPDATE" -> Host catches -> Updates -> Broadcasts.
  // We need to add case "PLAYER_UPDATE" ...
}
