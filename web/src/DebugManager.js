import GUI from "lil-gui";
import CannonDebugger from "cannon-es-debugger";
import Stats from "stats.js";

export class DebugManager {
  constructor(scene, world, config) {
    this.scene = scene;
    this.world = world;
    this.config = config;
    this.gui = null;
    this.cannonDebugger = null;
    this.playerDebugFolder = null;
    this.stats = null;

    this.init();
  }

  init() {
    // 1. Initialize FPS Stats
    if (this.config.debug.showFPS) {
      this.stats = new Stats();
      document.body.appendChild(this.stats.dom);
    }

    // 2. Initialize GUI
    if (
      this.config.debug.showPhysics ||
      this.config.debug.showStats ||
      this.config.debug.showFPS
    ) {
      this.gui = new GUI({ title: "Debug Panel" });

      const debugConf = this.config.debug;

      // Toggle Physics Wireframes
      this.gui
        .add(debugConf, "showPhysics")
        .name("Show Physics (Wireframe)")
        .onChange((value) => {
          // Handled in update loop
        });

      // Toggle FPS
      if (this.stats) {
        this.gui
          .add(debugConf, "showFPS")
          .name("Show FPS")
          .onChange((value) => {
            this.stats.dom.style.display = value ? "block" : "none";
          });
      }
    }

    // 3. Initialize Cannon Debugger (Wireframes)
    this.cannonDebugger = new CannonDebugger(this.scene, this.world, {
      color: 0xff0000,
    });
  }

  setupPlayerDebug(player) {
    if (!this.gui || !this.config.debug.showStats) return;

    // Clean up old folder if exists (for restarts)
    if (this.playerDebugFolder) {
      this.playerDebugFolder.destroy();
    }

    this.playerDebugFolder = this.gui.addFolder("🛠️ Physics Tuning");

    // 1. Damping
    this.playerDebugFolder
      .add(player.stats, "damping", 0.5, 0.999)
      .step(0.001)
      .name("Friction (0.8=Mud, 0.99=Ice)")
      .onChange((val) => {
        console.log("Current Damping:", val);
      });

    // 2. Move Force
    this.playerDebugFolder
      .add(player.stats, "moveForce", 1000, 100000)
      .step(100)
      .name("Acceleration Force");

    // 3. Max Speed
    this.playerDebugFolder
      .add(player.stats, "maxSpeed", 10, 200)
      .name("Max Speed Limit");

    // 4. Barge Force
    this.playerDebugFolder
      .add(player.stats, "bargeForce", 1000, 100000)
      .name("Barge Force");

    // 5. Barge Duration
    this.playerDebugFolder
      .add(player.stats, "bargeDuration", 0.1, 2)
      .name("Barge Duration");

    // 6. Barge Cooldown
    this.playerDebugFolder
      .add(player.stats, "bargeCooldown", 0.1, 2)
      .name("Barge Cooldown");

    // 7. Mass
    this.playerDebugFolder
      .add(player.stats, "mass", 10, 1000)
      .name("Mass")
      .onChange((val) => {
        player.setMass(val);
      });

    this.playerDebugFolder.open();
  }

  update() {
    // Update FPS
    if (this.stats && this.config.debug.showFPS) {
      this.stats.update();
    }

    // Update Wireframes
    if (this.config.debug.showPhysics && this.cannonDebugger) {
      this.cannonDebugger.update();
    }
  }
}
