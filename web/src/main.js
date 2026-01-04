import * as THREE from "three";
import * as CANNON from "cannon-es";
import { Player } from "./Player.js";
import { CameraController } from "./CameraController.js";
import { Arena } from "./Arena.js";
import { NetworkManager } from "./NetworkManager.js";
import { DebugManager } from "./DebugManager.js";
import { GameConfig } from "./GameConfig.js"; // Import Config

import { UIManager } from "./UIManager.js";
import { HUDManager } from "./HUDManager.js";
import { MenuManager } from "./MenuManager.js";
import i18n from "./Localization.js";

// --- Scene & Camera ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcccccc);
scene.fog = new THREE.Fog(0xcccccc, 20, 60);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(10, 15, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// --- Lights ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 5);
directionalLight.castShadow = true;
scene.add(directionalLight);

// --- Physics World ---
const world = new CANNON.World();
const g = GameConfig.world.gravity;
world.gravity.set(g.x, g.y, g.z);

// --- Debug Tools ---
// Initialize Debug Manager with GameConfig
const debugManager = new DebugManager(scene, world, GameConfig);

// --- Materials ---
const defaultMaterial = new CANNON.Material("default");
const playerMaterial = new CANNON.Material("player");
const obstacleMaterial = new CANNON.Material("obstacle");

const playerContactMat = new CANNON.ContactMaterial(
  playerMaterial,
  defaultMaterial,
  {
    friction: 0.0,
    restitution: 0.0,
  }
);
const playerPlayerMat = new CANNON.ContactMaterial(
  playerMaterial,
  playerMaterial,
  {
    friction: 0.0, // WAS 0.3 - Prevent sticky combat
    restitution: 0.9,
  }
);
const playerObstacleMat = new CANNON.ContactMaterial(
  playerMaterial,
  obstacleMaterial,
  {
    friction: 0.0,
    restitution: 0.6, // WAS 0.0 - Allow walls to bounce you back
  }
);

world.addContactMaterial(playerContactMat);
world.addContactMaterial(playerPlayerMat);
world.addContactMaterial(playerObstacleMat);

// --- Objects ---

// 1. Arena System
const materials = {
  default: defaultMaterial,
  obstacle: obstacleMaterial,
};

let arena, player, dummy, p1Spawn, p2Spawn, cameraController;
let network, uiManager;
const remotePlayers = {};
// Select Random Color from Config Palette (Default)
// Now managed by UIManager
let myColor = GameConfig.game.palette[0];

// 1. Setup Networking & UI
network = new NetworkManager();
uiManager = new UIManager();
const hudManager = new HUDManager();
let lastPlayers = [];
let lobbyPlayers = []; // Store latest lobby state for game start
let gameScores = {}; // Key: Player Name, Value: Score

let isRespawning = false; // Prevent death loop

const SEND_INTERVAL = 30; // 30ms = 33 packets/sec
let lastSendTime = 0;

const menuManager = new MenuManager();

// --- MENU HANDLERS ---
menuManager.onCreateClicked = async (name) => {
  console.log(`[Main] Creating Room for ${name}`);
  await network.connect();
  network.sendCreateRoom(name);
};

menuManager.onJoinClicked = async (name, code) => {
  console.log(`[Main] Joining Room ${code} as ${name}`);
  await network.connect();
  network.sendJoinRoom(name, code);
};

network.onRoomJoined((data) => {
  console.log("Joined Room!", data);
  menuManager.hide();
  uiManager.showLobby();
  uiManager.setRoomId(data.roomId);
});

uiManager.onActionClick = () => {
  const me = lobbyPlayers.find((p) => p.isLocal);
  if (!me) return;

  if (me.isHost) {
    network.sendStartGame();
  } else {
    // Toggle Ready
    const newState = !me.isReady;
    network.sendReady(newState);
  }
};

// FIX: Bind Color Selection
uiManager.onColorSelect = (color) => {
  network.sendPlayerUpdate(color);
};

// FIX: Bind Chat Send
uiManager.onChatSend = (msg) => {
  network.sendChat(msg);
};

// REMOVED: Auto-connect at bottom. Connection is now on-demand via Menu.

// --- Network Callbacks ---
network.onLobbyUpdate((players) => {
  // FORCE RE-EVALUATE isLocal to handle any type/reference mismatches
  players.forEach((p) => {
    if (String(p.id) === String(network.playerId)) {
      p.isLocal = true;
    }
  });

  lobbyPlayers = players; // Capture state

  uiManager.renderPlayerList(players);
  uiManager.updateColorGrid(players);

  // --- Diff Logic for System Messages ---
  if (lastPlayers.length > 0) {
    // 1. Check Joined
    players.forEach((p) => {
      if (!lastPlayers.find((lp) => lp.id === p.id)) {
        uiManager.addChatMessage("System", `${p.name} joined.`, null, false);
      }
    });
    // 2. Check Left
    lastPlayers.forEach((lp) => {
      if (!players.find((p) => p.id === lp.id)) {
        uiManager.addChatMessage("System", `${lp.name} left.`, null, false);
      }
    });
    // 3. Check Ready Status
    players.forEach((p) => {
      const old = lastPlayers.find((lp) => lp.id === p.id);
      if (old && old.isReady !== p.isReady) {
        const status = p.isReady ? "READY" : "waiting";
        uiManager.addChatMessage(
          "System",
          `${p.name} is ${status}`,
          null,
          false
        );
      }
    });
  }

  // Update lastPlayers (clone to prevent ref issues)
  lastPlayers = JSON.parse(JSON.stringify(players));

  // Find myself to update Host/Ready button state
  const me = players.find((p) => p.isLocal);
  if (me) {
    // uiManager.setRoomId(me.roomId || "----"); // Removed: roomId not in player object

    // Check if ALL players are ready
    const allReady = players.every((p) => p.isReady);

    // Update button style based on Host status
    uiManager.updateActionButton(me.isHost, me.isReady, allReady);
    // Sync local ready state
    uiManager.isLocalReady = me.isReady;
  }
});

network.onChatMessage((data) => {
  const isLocal = data.id === network.playerId;
  uiManager.addChatMessage(
    data.name || data.id,
    data.message,
    data.color,
    isLocal
  );
});

network.onGameStart((data) => {
  const serverSeed = data.seed;
  const duration = data.duration || 300; // Default 5 mins

  console.log("Starting Game with seed:", serverSeed, "Duration:", duration);
  uiManager.hideLobby();
  hudManager.show();
  hudManager.startGameTimer(duration);

  // Initialize Leaderboard with 0 scores
  gameScores = {};
  lobbyPlayers.forEach((p) => (gameScores[p.name] = 0));
  isRespawning = false; // Reset state

  const initialLb = lobbyPlayers.map((p) => ({
    name: p.name,
    color: p.color,
    score: 0,
    isLocal: p.isLocal,
  }));
  hudManager.updateLeaderboard(initialLb);

  // FIX: Sync myColor from Lobby State
  const me = lobbyPlayers.find((p) => p.isLocal);
  if (me && me.color) {
    console.log("Setting Game Color from Lobby:", me.color);
    myColor = me.color;
  }

  const mapRadius = data.mapRadius;
  startGame(serverSeed, mapRadius);
});

// START CONNECTION - REMOVED (Handled by Menu)
// network.connect();

network.onMessage((data) => {
  if (remotePlayers[data.id]) {
    // Update Existing
    // Update Existing
    const p = remotePlayers[data.id];
    // p.body.position.set(data.x, data.y, data.z);
    // p.body.quaternion.set(data.rx, data.ry, data.rz, data.rw);
    // p.body.velocity.set(data.vx, data.vy, data.vz);

    // Use Interpolation Target
    p.setNetworkTarget(
      { x: data.x, y: data.y, z: data.z },
      { x: data.rx, y: data.ry, z: data.rz, w: data.rw },
      { x: data.vx, y: data.vy, z: data.vz }
    );

    // Ensure Color Sync
    if (data.color && p.color !== data.color) {
      p.setSkinColor(data.color);
    }
  } else if (data.type === "PLAYER_LEFT") {
    const p = remotePlayers[data.id];
    if (p) {
      console.log(`Player Left: ${data.id}`);
      scene.remove(p.visualRoot);
      world.removeBody(p.body);
      delete remotePlayers[data.id];
    }
  } else if (data.type === "KILL_FEED") {
    // { type: "KILL_FEED", killer: "A", victim: "B", feedType: "shove" }
    if (hudManager) {
      let killerName = data.killer;
      let victimName = data.victim;
      let feedMethod = data.feedType;

      // FIX: Robust check for "undefined" string
      if (killerName === "undefined") killerName = "";
      if (victimName === "undefined") victimName = "";

      const killerObj = lobbyPlayers.find((p) => p.name === killerName);
      const victimObj = lobbyPlayers.find((p) => p.name === victimName);

      // Helper to ensure CSS Hex Color
      const toHex = (c) => {
        if (!c) return "#333";
        if (typeof c === "string") return c.startsWith("#") ? c : "#" + c;
        return "#" + c.toString(16).padStart(6, "0");
      };

      // Default colors if not found
      let kColor = killerObj ? toHex(killerObj.color) : "#333";
      let vColor = victimObj ? toHex(victimObj.color) : "#333";

      // Formatting
      if (!killerName) {
        // Suicide Case: "Name fell"
        killerName = victimName;
        kColor = vColor;
        victimName = ""; // Hide victim slot
        vColor = "";

        if (feedMethod === "suicide") feedMethod = i18n.t("game.feed_suicided");
      } else {
        // Kill Case: "A shoved B"
        if (feedMethod === "shove") feedMethod = i18n.t("game.feed_shoved");
      }

      hudManager.showKillFeed(
        killerName,
        kColor,
        victimName,
        vColor,
        feedMethod
      );

      // FIX: Update Leaderboard Scores
      // data.killerScore comes from backend
      if (data.killerScore !== undefined && killerObj) {
        gameScores[killerObj.name] = data.killerScore;
      }

      const currentLb = lobbyPlayers.map((p) => ({
        name: p.name,
        color: p.color,
        score: gameScores[p.name] || 0, // Read from persistent map
        isLocal: p.isLocal,
      }));

      // Sort Descending
      currentLb.sort((a, b) => b.score - a.score);

      hudManager.updateLeaderboard(currentLb);
    }
  } else if (data.type === "YOU_DIED") {
    hudManager.showDeathScreen(data.respawnIn);
    if (player) player.inputEnabled = false;
  } else if (data.type === "RESPAWN_NOW") {
    hudManager.hideDeathScreen();
    isRespawning = false;
    if (player) {
      player.inputEnabled = true;
      player.reset({ x: data.x, y: data.y, z: data.z });
    }
  } else if (data.type === "GAME_OVER") {
    hudManager.showGameOver(data);
    if (player) player.inputEnabled = false;

    // Bind Reload Button
    const btn = document.getElementById("btn-back-lobby");
    if (btn) {
      btn.onclick = () => window.location.reload();
    }
  } else {
    // Spawn New Remote Player
    // ONLY SPAWN IF GAME HAS STARTED (check if arena exists)
    if (arena) {
      console.log(`Spawn Remote Player: ${data.id} (${data.color})`);
      const p = new Player(
        scene,
        world,
        { x: data.x, y: data.y, z: data.z },
        data.color || 0x00ffff,
        playerMaterial,
        false
      );
      // Remote players should also use standard mass
      p.setMass(GameConfig.player.mass);
      remotePlayers[data.id] = p;
    }
  }
});

function startGame(serverSeed, mapRadiusOverride) {
  try {
    console.log("Initializing Arena with Seed:" + serverSeed);
    // Use RANDOM_SQUARE with Server Seed
    arena = new Arena(
      scene,
      world,
      materials,
      GameConfig.game.playerCount,
      "RANDOM_SQUARE",
      serverSeed,
      mapRadiusOverride
    );

    // 2. Players (Use Random Spawn)
    const p1Spawn = arena.getRandomSpawnPoint();
    player = new Player(
      scene,
      world,
      { x: p1Spawn.x, y: 5, z: p1Spawn.z },
      myColor,
      playerMaterial
    );

    cameraController = new CameraController(camera, player);

    // Setup Physics Debugging via Manager
    if (GameConfig.debug.showStats) {
      debugManager.setupPlayerDebug(player);
    }

    const lastHitTimes = {};
    const HIT_COOLDOWN = 500; // ms

    // --- COLLISION CALLBACK ---
    player.setOnCollide((collidedBody) => {
      // Find which remote player owns this body
      const targetId = Object.keys(remotePlayers).find(
        (id) => remotePlayers[id].body === collidedBody
      );

      if (targetId) {
        const now = Date.now();
        if (
          !lastHitTimes[targetId] ||
          now - lastHitTimes[targetId] > HIT_COOLDOWN
        ) {
          // console.log(`[Game] Hit detected on ${targetId}`);
          network.sendHit(targetId);
          lastHitTimes[targetId] = now;
        }
      }
    });

    // Force sync
    player.update(GameConfig.world.timeStep);
    cameraController.update(GameConfig.world.timeStep, true);

    // Start Loop
    animate();
  } catch (e) {
    console.error("CRITICAL INIT ERROR:", e);
    alert("Init Error: " + e.message);
  }
}

function animate() {
  requestAnimationFrame(animate);

  const dt = GameConfig.world.timeStep;

  world.fixedStep(dt);

  // Safe Update Loop
  if (player && arena && cameraController) {
    player.update(dt);
    if (dummy) dummy.update(dt);

    // Network Sync (Throttled)
    const now = Date.now();
    if (now - lastSendTime > SEND_INTERVAL) {
      network.sendState(
        player.body.position,
        player.body.quaternion,
        player.body.velocity,
        myColor
      );
      lastSendTime = now;
    }

    // Update Remote Players
    Object.values(remotePlayers).forEach((p) => p.update(dt));

    // Update Obstacles via Arena
    arena.update();

    // Ring Out Logic
    if (player.body.position.y < arena.config.killY && !isRespawning) {
      console.log("[Game] Player Died -> Respawning");
      isRespawning = true;
      network.sendDeath();
    }
    if (dummy && dummy.body.position.y < arena.config.killY) {
      dummy.reset({ x: p2Spawn.x, y: 5, z: p2Spawn.z });
      dummy.body.velocity.set(0, 0, 0);
    }

    cameraController.update(dt);
  }

  // Update Debug Manager (Wireframes & FPS)
  debugManager.update();

  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Remove auto-start animate()
// animate();
