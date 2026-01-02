export class NetworkManager {
    constructor() {
        this.playerId = 'Player_' + Math.floor(Math.random() * 10000);
        this.socket = null;
        this.messageHandler = null;
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        // If dev, assumes localhost:8080. If prod, uses window.location.host
        const host = window.location.hostname === 'localhost' ? 'localhost:8080' : window.location.host;
        
        this.socket = new WebSocket(`${protocol}://${host}/ws`);

        this.socket.onopen = () => {
            console.log(`✅ Connected as ${this.playerId}`);
        };

        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === 'WELCOME') {
                console.log("Received Map Seed from Server:", data.seed);
                this.playerId = data.id;
                if (this.gameStartCallback) {
                    this.gameStartCallback(data.seed);
                }
                return;
            }

            if (this.messageHandler) {
                // Ignore our own messages (Client-side filtering for MVP)
                if (data.id !== this.playerId) {
                    this.messageHandler(data);
                }
            }
        };

        this.socket.onerror = (error) => console.error("WebSocket Error:", error);
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
                type: 'STATE',
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
                vz: velocity.z
            };
            this.socket.send(JSON.stringify(packet));
        }
    }
}
