export class MenuManager {
  constructor() {
    // 1. DOM Elements
    this.menuLayer = document.getElementById("main-menu-layer");
    this.elemNameInput = document.getElementById("menu-player-name");
    this.elemCodeInput = document.getElementById("menu-room-code");
    this.btnCreate = document.getElementById("btn-create-room");
    this.btnJoin = document.getElementById("btn-join-room");

    // Callbacks
    this.onCreateClicked = null;
    this.onJoinClicked = null;

    // Initialize
    this.setupListeners();
  }

  setupListeners() {
    // Input Handling: Room Code (Numbers only)
    this.elemCodeInput.addEventListener("input", (e) => {
      // Remove non-numeric chars
      e.target.value = e.target.value.replace(/[^0-9]/g, "");
    });

    // Create Button
    this.btnCreate.addEventListener("click", () => {
      const name = this.validateName();
      if (name) {
        if (this.onCreateClicked) {
          this.onCreateClicked(name);
        }
      }
    });

    // Join Button
    this.btnJoin.addEventListener("click", () => {
      const name = this.validateName();
      const code = this.validateCode();

      if (name && code) {
        if (this.onJoinClicked) {
          this.onJoinClicked(name, code);
        }
      }
    });

    // Enter Key Support (on inputs)
    this.elemNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        // If code is empty, maybe they want to create? Or we just focus code?
        // Let's bias towards Create if code is empty, Join if code is filled?
        // For simplicity, just blur or focus next.
        if (this.elemCodeInput.value.length > 0) {
          this.btnJoin.click();
        } else {
          this.btnCreate.click();
        }
      }
    });

    this.elemCodeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.btnJoin.click();
      }
    });
  }

  // --- VALIDATION HELPERS ---

  validateName() {
    const raw = this.elemNameInput.value.trim();
    if (raw.length === 0) {
      alert("Please enter your name!");
      this.elemNameInput.focus();
      return null;
    }
    // Max length is enforced by HTML maxlength="12", but good to be safe
    return raw.substring(0, 12);
  }

  validateCode() {
    const raw = this.elemCodeInput.value.trim();
    if (raw.length !== 6) {
      alert("Room code must be 6 digits!");
      this.elemCodeInput.focus();
      return null;
    }
    return raw;
  }

  // --- VISIBILITY ---

  show() {
    this.menuLayer.classList.remove("hidden");
  }

  hide() {
    this.menuLayer.classList.add("hidden");
  }
}
