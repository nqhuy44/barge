# ⚓ BARGE - GAME DESIGN DOCUMENT

## 1. Core Concept
- **Title:** BARGE
- **Tagline:** Hit hard! Fall fast.
- **Genre:** IO / Physics Brawler / Battle Royale.
- **Goal:** Húc văng tất cả người chơi khác khỏi sàn đấu. Người sống sót cuối cùng là người chiến thắng (Last Man Standing).

## 2. Mechanics
### A. Movement (Heavy & Drift)
- **Cảm giác:** Nhân vật không di chuyển như người đi bộ, mà như một chiếc xe điện đụng (Bumper car) hoặc một cục nam châm nặng.
- **Physics:**
    - Có quán tính (Acceleration): Cần thời gian để đạt tốc độ tối đa.
    - Có đà trượt (Friction/Drag): Khi thả phím, nhân vật trượt thêm một đoạn rồi mới dừng.
- **Input:** - `Arrow Keys` (PC): Di chuyển trực tiếp theo hướng phím (Direct Direction). Không xoay chuột.

### B. The Barge (Core Action)
- **Input:** Phím `SPACE`.
- **Hành động:** 1. **Anticipation (0.1s):** Nhân vật co lại (Squash) một chút để lấy đà.
    2. **Release (0.3s):** Nhân vật phình to và lao vút về phía trước (Impulse Force) với tốc độ cao gấp 3 lần bình thường.
    3. **Recovery (1.0s):** Cooldown. Không thể Dash tiếp ngay lập tức.
- **Tác dụng:**
    - Nếu trúng đối thủ: Gây lực đẩy lùi cực mạnh (Knockback).
    - Nếu trúng tường: Bản thân bị nảy ngược lại (Bounce).

### C. Health & Death
- **HP:** Không có máu.
- **Death Condition:** Rơi khỏi sàn đấu (Ring Out). Tọa độ Y < Threshold (-5).

## 3. Game Flow
1. **Lobby:** Người chơi nhập tên, chọn màu, chat chờ đợi.
2. **Countdown:** 3 - 2 - 1 - BARGE!
3. **Combat:** Sàn đấu là một đĩa tròn lơ lửng. Không có lan can bảo vệ.
4. **End:** Khi chỉ còn 1 người -> Thông báo Winner -> Quay về Lobby.

## 4. Physics Constants (Target)
*Các thông số này để tinh chỉnh (Tune) trong quá trình dev:*
- `MASS`: 50kg (Đủ nặng để không bay lung tung).
- `MOVE_SPEED`: 10 units/s.
- `BARGE_FORCE`: 500 units (Impulse).
- `FRICTION`: 0.3 (Độ trơn của sàn).
- `RESTITUTION`: 0.8 (Độ nảy khi va chạm).