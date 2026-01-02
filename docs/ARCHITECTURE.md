# ⚙️ BARGE - TECHNICAL ARCHITECTURE

## 1. Tech Stack
- **Frontend:** HTML5 Canvas, Three.js (Render), Cannon-es (Physics).
- **Backend:** Go (Golang), Gorilla WebSocket.
- **Build Tool:** Vite.

## 2. Network Model: Hybrid Authoritative
Game sử dụng mô hình lai để đảm bảo độ mượt (Responsiveness) và tính công bằng (Fairness).

### A. Client Responsibilities (Physics & Prediction)
- **Movement:** Client tự tính toán vật lý di chuyển và gửi `Position + Rotation + Velocity` lên Server.
- **Input Prediction:** Khi bấm nút, nhân vật di chuyển NGAY LẬP TỨC, không chờ Server confirm.
- **Collision Detection (Attacker Authority):**
    - Nếu Client A húc trúng Client B trên màn hình của A.
    - Client A gửi gói tin `HIT_EVENT` (chứa Vector lực đẩy) lên Server.
    - *Logic:* "Tao đánh trúng nó rồi, Server báo nó bay đi!"

### B. Server Responsibilities (Game State & Routing)
- **Broadcasting:** Nhận vị trí của A -> Gửi cho B, C, D (15-20 tick/s).
- **Hit Routing:** Nhận `HIT_EVENT` từ A -> Validate sơ bộ (Cooldown) -> Forward ngay cho B.
    - B nhận tin -> Tự áp dụng lực đẩy (Impulse) lên chính mình.
- **Rule Authority:**
    - **Death:** Server check tọa độ Y của các player. Nếu `Y < -5` -> Gửi `PLAYER_DIED`.
    - **Win:** Server đếm số người còn sống. Nếu `Count == 1` -> Gửi `GAME_OVER(WinnerID)`.

## 3. Data Structures

### Player State (Sync continuously)
```json
{
  "id": "abcd",
  "x": 10.5,
  "y": 0.5,
  "z": -5.2,
  "rot": 1.57,
  "state": "IDLE" | "MOVE" | "BARGE" | "STUNNED"
}
```

### Hit Event (Event based)
```json
{
  "type": "HIT",
  "from": "player_A",
  "to": "player_B",
  "force": { "x": 100, "y": 50, "z": 0 }
}
```