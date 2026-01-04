import i18n from "./Localization.js";

export class HUDManager {
  constructor() {
    this.uiLayer = document.getElementById("game-ui-layer");
    this.timerVal = document.getElementById("timer-val");
    this.killFeed = document.getElementById("kill-feed");
    this.leaderboardList = document.getElementById("leaderboard-list");
    this.controlsHint = document.getElementById("controls-hint");
    this.deathLayer = document.getElementById("death-layer");
    this.respawnTimer = document.getElementById("respawn-timer");

    this.gameOverLayer = document.getElementById("game-over-layer");
    this.goWinner = document.getElementById("go-winner");
    this.goLeaderboardList = document.getElementById("go-leaderboard-list");
  }

  show() {
    this.uiLayer.classList.remove("hidden");
  }

  hide() {
    this.uiLayer.classList.add("hidden");
  }

  // ... (keep existing methods) ...

  // --- 6. GAME OVER SCREEN ---
  showGameOver(data) {
    if (this.gameOverLayer) {
      this.gameOverLayer.classList.remove("hidden");
    }

    if (this.goWinner) {
      this.goWinner.innerText = `🏆 ${data.winnerName}`;
      // Optional: Set background color for badge if passed
      // this.goWinner.style.color = data.winnerColor || "#000";
    }

    if (this.goLeaderboardList && data.leaderboard) {
      this.goLeaderboardList.innerHTML = "";

      data.leaderboard.forEach((p, index) => {
        const row = document.createElement("div");
        row.className = "end-lb-item";

        const rankClass = index === 0 ? "rank top1" : "rank";

        row.innerHTML = `
          <div><span class="${rankClass}">${index + 1}</span> ${p.name}</div>
          <div>${p.score} ${i18n.t("game.kills")}</div>
        `;

        this.goLeaderboardList.appendChild(row);
      });
    }
  }

  // --- 1. TIMER ---
  startGameTimer(duration) {
    this.stopGameTimer();
    this.updateTimer(duration);

    let remaining = duration;
    this.gameInterval = setInterval(() => {
      remaining--;
      if (remaining < 0) remaining = 0;
      this.updateTimer(remaining);
      if (remaining === 0) this.stopGameTimer();
    }, 1000);
  }

  stopGameTimer() {
    if (this.gameInterval) {
      clearInterval(this.gameInterval);
      this.gameInterval = null;
    }
  }

  updateTimer(seconds) {
    this.timer = seconds;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const display = `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;

    if (this.timerVal) {
      this.timerVal.innerText = display;

      if (seconds < 10) {
        this.timerVal.classList.add("urgent");
      } else {
        this.timerVal.classList.remove("urgent");
      }
    }
  }

  // --- 2. LEADERBOARD ---
  // players: Array of { name, score, color, isLocal }
  // Sorted by score desc locally or externally
  updateLeaderboard(players) {
    if (!this.leaderboardList) return;

    // Clear ID based rendering or simple innerHTML replacement
    this.leaderboardList.innerHTML = "";

    // Show top 5
    const top5 = players.slice(0, 5);

    top5.forEach((p, index) => {
      const row = document.createElement("div");
      row.className = p.isLocal ? "lb-row me" : "lb-row";

      // Rank
      const rank = document.createElement("span");
      rank.className = "lb-rank";
      rank.innerText = index + 1;

      // Name
      const name = document.createElement("span");
      name.className = "lb-name";
      name.innerText = p.name;
      name.style.color = p.color || "#334155";
      if (p.isLocal) {
        name.innerText = `${p.name} ${i18n.t("game.player_you")}`;
      }

      // Score
      const score = document.createElement("span");
      score.className = "lb-score";
      score.innerText = p.score || 0;

      row.appendChild(rank);
      row.appendChild(name);
      row.appendChild(score);
      this.leaderboardList.appendChild(row);
    });
  }

  // --- 3. KILL FEED ---
  showKillFeed(killerName, killerColor, victimName, victimColor, method) {
    if (!this.killFeed) return;

    const item = document.createElement("div");
    item.className = "feed-item";

    // Sanitization happens via innerHTML construction of spans
    // But names should be escaped if possible, though innerText is safer.
    // Here we trust input or basic helper

    const kColor = killerColor || "#000";
    const vColor = victimColor || "#000";

    item.innerHTML = `<span class="feed-killer" style="color:${kColor}">${killerName}</span> ${method} <span class="feed-victim" style="color:${vColor}">${victimName}</span>`;

    this.killFeed.appendChild(item);

    // Animation / scroll logic if needed?
    // For now just append.

    // Auto Remove
    setTimeout(() => {
      item.style.opacity = "0";
      item.style.transition = "opacity 0.5s";
      setTimeout(() => item.remove(), 500);
    }, 4000);
  }

  // --- 4. CONTROLS ---
  toggleControls(visible) {
    if (!this.controlsHint) return;
    if (visible) {
      this.controlsHint.style.display = "flex";
    } else {
      this.controlsHint.style.display = "none";
    }
  }

  // --- 5. DEATH SCREEN ---
  showDeathScreen(seconds) {
    if (this.deathLayer) {
      this.deathLayer.classList.remove("hidden");
    }

    if (this.respawnTimer) {
      this.respawnTimer.innerText = seconds;

      // Clear existing interval if any
      if (this.deathInterval) clearInterval(this.deathInterval);

      let current = seconds;
      this.deathInterval = setInterval(() => {
        current--;
        if (current <= 0) current = 0; // Don't go neg
        this.respawnTimer.innerText = current;
      }, 1000);
    }
  }

  hideDeathScreen() {
    if (this.deathLayer) {
      this.deathLayer.classList.add("hidden");
    }
    if (this.deathInterval) clearInterval(this.deathInterval);
  }
}
