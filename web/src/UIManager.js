import i18n from "./Localization.js";

export class UIManager {
  constructor() {
    this.uiLayer = document.getElementById("ui-layer");
    this.colorGrid = document.getElementById("color-grid");
    this.playerList = document.getElementById("player-list");
    this.roomBadge = document.getElementById("room-badge");
    this.playerCount = document.getElementById("player-count");
    this.btnStart = document.getElementById("btn-start"); // Reused for Ready/Start

    // State
    this.selectedColor = null;
    this.isLocalReady = false;
    this.palette = [
      "#ff5555",
      "#ff79c6",
      "#bd93f9",
      "#6272a4",
      "#8be9fd",
      "#50fa7b",
      "#f1fa8c",
      "#ffb86c",
      "#ff9f43", // Orange
      "#ee5253", // Red
      "#0abde3", // Cyan
      "#10ac84", // Dark Green
      "#222f3e", // Dark Blue
      "#5f27cd", // Purple
      "#c8d6e5", // Light Gray
      "#8395a7", // Gray
      "#2e86de", // Blue
      "#341f97", // Deep Purple
      "#54a0ff", // Light Blue
      "#1dd1a1", // Mint
    ];

    this.initColors();
    this.setupListeners();
    this.setupChatListeners();
  }

  // --- 1. INITIALIZATION ---

  initColors() {
    this.colorGrid.innerHTML = "";
    this.palette.forEach((color) => {
      const btn = document.createElement("div");
      btn.className = "color-btn";
      btn.style.backgroundColor = color;
      btn.dataset.color = color;
      btn.addEventListener("click", () => this.selectColor(color, btn));
      this.colorGrid.appendChild(btn);
    });
  }

  setupListeners() {
    // Action Button (Start / Ready)
    this.btnStart.addEventListener("click", () => {
      // Dispatch event to main game logic
      // For now, toggle visual state locally or trigger external callback
      if (this.onActionClick) {
        this.onActionClick();
      }
    });
    // Language Toggle
    const btnEn = document.getElementById("btn-lang-en");
    const btnVi = document.getElementById("btn-lang-vi");

    if (btnEn) {
      btnEn.addEventListener("click", () => {
        i18n.setLanguage("en");
        // Re-render local dynamic UI
        const me = this.lastPlayers
          ? this.lastPlayers.find((p) => p.isLocal)
          : null;
        if (this.lastPlayers) {
          this.renderPlayerList(this.lastPlayers);
          this.updateColorGrid(this.lastPlayers);
          // Update Action Button Text
          if (me) {
            const allReady = this.lastPlayers.every((p) => p.isReady);
            this.updateActionButton(me.isHost, me.isReady, allReady);
          }
        }
      });
    }
    if (btnVi) {
      btnVi.addEventListener("click", () => {
        i18n.setLanguage("vi");
        // Re-render local dynamic UI
        const me = this.lastPlayers
          ? this.lastPlayers.find((p) => p.isLocal)
          : null;
        if (this.lastPlayers) {
          this.renderPlayerList(this.lastPlayers);
          this.updateColorGrid(this.lastPlayers);
          if (me) {
            const allReady = this.lastPlayers.every((p) => p.isReady);
            this.updateActionButton(me.isHost, me.isReady, allReady);
          }
        }
      });
    }
  }

  // --- 2. RENDER LOGIC ---

  updateColorGrid(players) {
    if (!this.colorGrid) return;

    const me = players.find((p) => p.isLocal);
    const amIReady = me ? me.isReady : false;
    const amIHost = me ? me.isHost : false;

    // 1. Lock Grid if Ready (and not Host, who is always ready but exempt)
    // "except the host"
    if (amIReady && !amIHost) {
      this.colorGrid.classList.add("locked"); // Use class for styling
    } else {
      this.colorGrid.classList.remove("locked");
    }

    // 2. Identify Taken Colors (by OTHERS)
    const takenColors = new Set();
    players.forEach((p) => {
      if (!p.isLocal && p.color) {
        takenColors.add(p.color);
      }
    });

    // 3. Update Buttons
    const btns = this.colorGrid.querySelectorAll(".color-btn");
    btns.forEach((btn) => {
      const color = btn.dataset.color;

      // Reset
      btn.classList.remove("taken");
      btn.classList.remove("active");

      // Check Taken
      if (takenColors.has(color)) {
        btn.classList.add("taken");
      }

      // Check Active (My Color)
      if (me && me.color === color) {
        btn.classList.add("active");
      }
    });
  }

  renderPlayerList(players) {
    this.lastPlayers = players; // Store for re-render
    this.playerList.innerHTML = "";

    // Update Header Counts
    this.playerCount.innerText = `${players.length}/16 Players`;

    // Render Players
    players.forEach((p, i) => {
      const card = document.createElement("div");
      card.className = "player-card";

      // Status Class & Text (i18n)
      const isReady = p.isReady;
      const statusText = isReady
        ? i18n.t("lobby.ready_status")
        : i18n.t("lobby.waiting_status");
      const statusClass = isReady ? "status-ready" : "status-waiting";

      // Avatar Color
      const avColor = p.color || "#ccc";
      const nameSuffix = p.isLocal
        ? ` <span style="color: #64748b; font-size: 0.9em;">${i18n.t(
            "game.player_you"
          )}</span>`
        : "";
      const hostTag = p.isHost ? `<div class="p-host">HOST</div>` : "";

      card.innerHTML = `
                <div class="p-avatar" style="background-color: ${avColor}"></div>
                <div class="p-info">
                  <div class="p-name">${p.name}${nameSuffix}</div>
                  ${hostTag}
                </div>
                <div class="p-status ${statusClass}">${statusText}</div>
            `;
      this.playerList.appendChild(card);
    });
  }

  // --- 3. INTERACTIONS ---

  selectColor(color, btnElement) {
    this.selectedColor = color;

    // Visual Update
    const allBtns = this.colorGrid.querySelectorAll(".color-btn");
    allBtns.forEach((b) => b.classList.remove("active"));
    btnElement.classList.add("active");

    // Callback
    if (this.onColorSelect) {
      this.onColorSelect(color);
    }
  }

  updateActionButton(isHost, isReady, allReady) {
    // Remove all variant classes first
    this.btnStart.classList.remove(
      "start",
      "ready",
      "is-active",
      "ready-wait",
      "ready-done",
      "start-disabled",
      "start-enabled"
    );

    if (isHost) {
      if (allReady) {
        this.btnStart.classList.add("start-enabled");
        this.btnStart.innerText = i18n.t("lobby.start_btn");
        this.btnStart.disabled = false;
      } else {
        this.btnStart.classList.add("start-disabled");
        this.btnStart.innerText = i18n.t("lobby.start_btn");
        this.btnStart.disabled = true;
      }
    } else {
      this.btnStart.disabled = false; // Always clickable to toggle
      if (isReady) {
        this.btnStart.classList.add("ready-done");
        this.btnStart.innerText = "READY!";
      } else {
        this.btnStart.classList.add("ready-wait");
        this.btnStart.innerText = i18n.t("lobby.ready_btn");
      }
    }
  }

  // --- 4. VISIBILITY ---

  showLobby() {
    this.uiLayer.classList.remove("hidden");
  }

  hideLobby() {
    this.uiLayer.classList.add("hidden");
  }

  setRoomId(id) {
    if (this.roomBadge) this.roomBadge.innerText = `Room: ${id}`;
  }

  // --- 5. CHAT ---

  setupChatListeners() {
    this.chatInput = document.getElementById("chat-input");
    this.btnSend = document.getElementById("btn-send");
    this.chatBody = document.getElementById("chat-body");

    const send = () => {
      const msg = this.chatInput.value.trim();
      if (msg && this.onChatSend) {
        this.onChatSend(msg);
        this.chatInput.value = "";
      }
    };

    this.btnSend.addEventListener("click", send);
    this.chatInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") send();
    });
  }

  addChatMessage(name, message, color = null, isLocal = false) {
    if (!this.chatBody) return;

    const div = document.createElement("div");

    // System Message Check
    if (name === "System") {
      div.className = "chat-msg system-msg";
      div.innerHTML = `<b>${name}:</b> ${message}`;
    } else {
      div.className = isLocal ? "chat-msg me" : "chat-msg others";

      const nameHtml = !isLocal
        ? `<div class="msg-name" style="color:${
            color || "var(--g-purple)"
          }">${name}</div>`
        : `<div class="msg-name" style="color: #64748b; font-size: 0.7rem;">(You)</div>`;

      div.innerHTML = `
        ${nameHtml}
        <div class="msg-content">${message}</div>
      `;
    }

    this.chatBody.appendChild(div);

    // Scroll to bottom
    this.chatBody.scrollTop = this.chatBody.scrollHeight;
  }
}
