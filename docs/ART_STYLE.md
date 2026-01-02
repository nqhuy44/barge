# 🎨 BARGE - ART STYLE GUIDE

## 1. Visual Identity
- **Keywords:** Toy-like (Đồ chơi), Tactile (Có xúc giác), Clean (Sạch), Neon Blueprint (Bản vẽ).
- **Vibe:** Giống như những món đồ chơi cao su va đập trong một đấu trường ảo.

## 2. Characters (The Blobs)
- **Shape:** Không phải hình cầu hoàn hảo. Là dạng **Capsule** ngắn hoặc **Chamfer Box** (Hộp bo tròn góc).
- **Surface:** Bóng loáng (High Specular), cảm giác như nhựa cứng hoặc kẹo dẻo (Jelly).
- **Animation (Squash & Stretch - QUAN TRỌNG):**
    - **Idle:** Thở nhẹ (Scale Y lên xuống biên độ nhỏ).
    - **Moving:** Nghiêng về phía trước 15 độ.
    - **Impact:** Khi va chạm, mesh phải bị méo (biến dạng) tại điểm va chạm rồi đàn hồi lại.

## 3. Environment (The Arena)
- **Floor:**
    - Hình tròn phẳng.
    - Texture: Grid (Lưới) phát sáng nhẹ.
    - Màu nền: Tối để làm nổi bật nhân vật.
- **Background:** Màu solid hoặc Gradient tối (Deep Space). Không dùng skybox thực tế.

## 4. Color Palette (Hex Codes)
- **Background:** `#1E1E2E` (Deep Blue/Grey - Catppuccin Base).
- **Floor Grid:** `#313244` (Lighter Grey lines).
- **Player Colors (Vibrant):**
    - Red: `#FF5555`
    - Green: `#50FA7B`
    - Yellow: `#F1FA8C`
    - Purple: `#BD93F9`
    - Cyan: `#8BE9FD`
- **Effects:**
    - Dash Trail: Màu trắng mờ (`#FFFFFF` opacity 0.5).
    - Impact Flash: Trắng tinh (`#FFFFFF`).

## 5. UI Elements
- **Font:** Blocky, Bold, Sans-serif (Ví dụ: `Kanit`, `Rubik` hoặc `Fredoka One`).
- **Health/Name Tag:** Floating trên đầu nhân vật.