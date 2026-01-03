const resources = {
  en: {
    common: {
      loading: "Loading...",
      error: "Error",
    },
    menu: {
      title: "BARGE",
      tagline: "Hit hard! Fall fast!",
      name_label: "Nickname",
      placeholder_name: "Enter nickname...",
      start_divider: "START GAME",
      create_btn: "Create Lobby",
      join_divider: "OR JOIN ROOM",
      code_placeholder: "123456",
      join_btn: "Join Room",
      footer: "v0.1.0-mvp • Built by Huy Nguyen",
    },
    lobby: {
      room_label: "Room",
      players_label: "Players",
      colors_label: "Colors",
      chat_label: "CHAT",
      start_btn: "START GAME",
      ready_btn: "READY",
      waiting_btn: "Waiting...",
      waiting_status: "Waiting...",
      ready_status: "Ready",
      empty_slot: "Empty Slot",
      you_suffix: "(You)",
      chat_placeholder: "Type your message...",
    },
    game: {
      you_died: "YOU DIED",
      winner: "WINNER!",
      respawn: "Respawning...",
    },
  },
  vi: {
    common: {
      loading: "Đang tải...",
      error: "Lỗi",
    },
    menu: {
      title: "HÚC!",
      tagline: "Húc chết mẹ nó!",
      name_label: "Mật danh",
      placeholder_name: "Nhập mật danh...",
      start_divider: "BẮT ĐẦU",
      create_btn: "Tạo Phòng",
      join_divider: "HOẶC VÀO PHÒNG",
      code_placeholder: "123456",
      join_btn: "Vào Ngay",
      footer: "v0.1.0-mvp • Được làm bởi Huy Nguyen",
    },
    lobby: {
      room_label: "Phòng",
      players_label: "Người chơi",
      colors_label: "Màu sắc",
      chat_label: "TRÒ CHUYỆN",
      start_btn: "BẮT ĐẦU",
      ready_btn: "SẴN SÀNG",
      waiting_btn: "Đang chờ...",
      waiting_status: "Đang chờ...",
      ready_status: "Sẵn sàng",
      empty_slot: "Trống",
      you_suffix: "(Bạn)",
      chat_placeholder: "Nhập tin nhắn...",
    },
    game: {
      you_died: "ĐÃ CHẾT",
      winner: "THẮNG RỒI!",
      respawn: "Đang hồi sinh...",
    },
  },
};

class Localization {
  constructor() {
    this.lang = localStorage.getItem("lang") || "vi";

    // Auto-detect if not set? For now user said default 'en'.
    // Apply translations on load
    document.addEventListener("DOMContentLoaded", () => {
      this.translatePage();
    });
  }

  t(key) {
    const keys = key.split(".");
    let value = resources[this.lang];

    for (const k of keys) {
      if (value && value[k]) {
        value = value[k];
      } else {
        return key; // Fallback to key if not found
      }
    }
    return value;
  }

  translatePage() {
    // 1. Text Content
    const elements = document.querySelectorAll("[data-i18n]");
    elements.forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const text = this.t(key);
      if (text) {
        // If the element has children (like nested tags), we might replace them.
        // For safety, textContent is best.
        el.textContent = text;
      }
    });

    // 2. Placeholders
    const inputs = document.querySelectorAll("[data-i18n-placeholder]");
    inputs.forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      const text = this.t(key);
      if (text) {
        el.placeholder = text;
      }
    });

    // Save logic
    localStorage.setItem("lang", this.lang);

    // Notify listeners if needed? For now simple direct update.
  }

  setLanguage(lang) {
    if (resources[lang]) {
      this.lang = lang;
      this.translatePage();
    } else {
      console.warn(`Language ${lang} not supported.`);
    }
  }

  getLanguage() {
    return this.lang;
  }
}

// Singleton
const i18n = new Localization();
export default i18n;
