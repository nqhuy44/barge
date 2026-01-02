# ⚓ PROJECT: BARGE

**Tagline:** Hit hard! Fall fast.
**Domain:** `barge.firstdraft.sh`
**Repo:** `https://github.com/nqhuy44/barge`
**Style:** Toy-like, Physics-based, Clean (Blobs/Capsules).

---

## 🧭 MVP ROADMAP

### 🟦 STATE 0 – Setup & Tech Stack

🎯 **Mục tiêu:** Khởi tạo dự án & Môi trường.

- **Tech Stack:**
  - **Frontend:** Three.js (WebGL).
  - **Backend:** Go (Golang) + WebSocket.
- **Tasks:**
  - [ ] Init Git repo & Project structure.
  - [ ] Setup Basic Web Server (Go) serving static files.
  - [ ] Setup Canvas Three.js "Hello World".

### 🟦 STATE 1 – Core Control (Arrows Only)

🎯 **Mục tiêu:** Di chuyển nhân vật cơ bản.

- **Character:** Capsule/Sphere (Placeholder).
- **Input:**
  - **Arrow Keys:** Di chuyển trực tiếp (Direct Direction).
  - _Note:_ Không dùng chuột để xoay.
- **Tasks:**
  - [ ] Implement Movement Logic (Acceleration/Friction).
  - [ ] Camera Setup (Isometric/Top-down Fixed).

### 🟦 STATE 2 – The "Toy" Physics & Animation

🎯 **Mục tiêu:** Tạo cảm giác nhân vật như khối thạch/đồ chơi đàn hồi.

- **Visual:** Tạo hình nhân vật dạng Blob/Bean đơn giản.
- **Mechanic - The Barge:**
  - **Input:** Phím `SPACE`.
  - **Action:** Nhân vật phình to -> Lao nhanh về hướng mặt (Impulse Force).
- **Juice (Squash & Stretch):**
  - [ ] Di chuyển: Nghiêng về trước.
  - [ ] Dừng/Va chạm: Bẹp xuống (Squash) và nảy lên.
  - [ ] Barge: Co lại rồi bung ra.

### 🟦 STATE 3 – Arena & Impact (Offline Test)

🎯 **Mục tiêu:** Hoàn thiện vật lý va chạm môi trường.

- **Map:** Sàn đấu tròn, lơ lửng, không lan can.
- **Physics:**
  - [ ] Wall Bounce: Va vào tường/vật cản thì nảy ra.
  - [ ] Ring-out: Rơi khỏi sàn (Y < threshold) -> Respawn (để test).
- **Tasks:**
  - [ ] Code hàm `ApplyKnockback(force)` chuẩn.
  - [ ] Test húc vào tường/bao cát (dummy).

### 🟦 STATE 4 – Networking Core

🎯 **Mục tiêu:** Đồng bộ vị trí & Va chạm (Chưa cần UI).

- **Architecture:** Hybrid (Attacker Authority).
- **Tasks:**
  - [ ] WebSocket Connection.
  - [ ] **Sync Movement:** Gửi Pos/Rot/State -> Client khác nội suy (Lerp).
  - [ ] **Sync Combat:**
    - Player A húc trúng B (trên máy A) -> Gửi packet `HIT`.
    - Server forward `HIT` -> B nhận và tự văng đi.

### 🟦 STATE 5 – UI System: Lobby, Chat & Colors

🎯 **Mục tiêu:** Hệ thống phòng chờ hoàn chỉnh.

- **Flow:** Main Menu -> Join/Create -> Lobby -> Game.
- **Features:**
  - **Main Menu:** Nhập tên (`Enter Name`).
  - **Room Logic:** Create Room (Random ID) / Join Room (Passcode/ID).
  - **Lobby (Waiting Room):**
    - [ ] List Players: Hiển thị danh sách người đang chờ.
    - [ ] **Color Picker:** Chọn màu cho nhân vật -> Sync màu này sang máy người khác.
    - [ ] **Chat Box:** Khung chat đơn giản (Text only) để giao tiếp.
    - [ ] Ready/Start Button (Host only).

### 🟦 STATE 6 – The Full Game Loop

🎯 **Mục tiêu:** Ghép nối Gameplay vào hệ thống Room.

- **Flow Integration:**
  - [ ] Lobby -> Start Game -> Scene chuyển sang Arena.
  - [ ] Spawn nhân vật theo màu đã chọn ở Lobby.
- **Game Logic:**
  - [ ] **Countdown:** 3-2-1 Fight!
  - [ ] **Alive Check:** Server theo dõi ai còn trên sàn.
  - [ ] **Win Condition:** Người cuối cùng sống sót.
- **End Game UI:**
  - [ ] Hiện bảng xếp hạng / Winner.
  - [ ] Button: `Close` -> Rời phòng, quay về Main Menu.

### 🟦 STATE 7 – Polish & Deploy

🎯 **Mục tiêu:** Hoàn thiện và Public.

- **Polish:**
  - [ ] Visual FX: Trail, Dust, Impact Flash.
  - [ ] Sound: SFX va chạm vui nhộn.
- **Deploy:**
  - [ ] Dockerize App.
  - [ ] Deploy lên VPS/Cloud -> Domain `barge.firstdraft.sh`.
