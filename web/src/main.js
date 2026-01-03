import * as THREE from "three";
import * as CANNON from "cannon-es";
import { Player } from "./Player.js";
import { CameraController } from "./CameraController.js";
import { Arena } from "./Arena.js";
import { NetworkManager } from "./NetworkManager.js";
import { DebugManager } from "./DebugManager.js";
import { GameConfig } from "./GameConfig.js"; // Import Config

import { UIManager } from "./UIManager.js";
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
let lastPlayers = [];

const menuManager = new MenuManager();

// --- MENU HANDLERS ---

// A. Handle Network Success
network.onRoomJoined((data) => {
  console.log("✅ Joined Room:", data.roomId);
  menuManager.hide();
  uiManager.showLobby();
  uiManager.setRoomId(data.roomId);

  // Reset diff state
  lastPlayers = [];

  if (data.isHost) {
    uiManager.addChatMessage("System", "Room created", null, false);
  } else {
    uiManager.addChatMessage(
      "System",
      `Joined room ${data.roomId}`,
      null,
      false
    );
  }

  // Set Initial Button State (Creator is effectively ready and allReady)
  uiManager.updateActionButton(data.isHost, false, data.isHost);
});

network.onError((msg) => {
  console.error("Server Error:", msg);
  alert(msg); // Show error to user
});

// B. Handle Menu Actions
menuManager.onCreateClicked = (name) => {
  console.log("👑 Create Room Request:", name);
  // 1. Connect first
  network
    .connect()
    .then(() => {
      // 2. Send Packet
      network.sendCreateRoom(name);
    })
    .catch((err) => {
      alert("Connection Failed: " + err);
    });
};

menuManager.onJoinClicked = (name, code) => {
  console.log("▶ Join Room Request:", name, code);
  network
    .connect()
    .then(() => {
      network.sendJoinRoom(name, code);
    })
    .catch((err) => {
      alert("Connection Failed: " + err);
    });
};

// --- Connect UI to Network ---
uiManager.onColorSelect = (color) => {
  myColor = color;
  network.sendPlayerUpdate(color);
};

uiManager.onActionClick = () => {
  // Logic: Check if we are Host or Client
  // For now, we rely on the UI state, but ideally we check our local player object from the server list
  // HACK: Start Game if button says START, else Toggle Ready
  const btnText = uiManager.btnStart.innerText;
  if (btnText.includes("START")) {
    network.sendStartGame();
  } else {
    // Toggle Ready
    uiManager.isLocalReady = !uiManager.isLocalReady;
    network.sendReady(uiManager.isLocalReady);
    uiManager.updateActionButton(false, uiManager.isLocalReady);
  }
};

uiManager.onChatSend = (msg) => {
  network.sendChat(msg);
  // Optimistic Add
  // uiManager.addChatMessage("You", msg, myColor);
};

// --- Network Callbacks ---
network.onLobbyUpdate((players) => {
  // FORCE RE-EVALUATE isLocal to handle any type/reference mismatches
  players.forEach((p) => {
    if (String(p.id) === String(network.playerId)) {
      p.isLocal = true;
    }
  });

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

network.onGameStart((serverSeed) => {
  console.log("Starting Game with seed:", serverSeed);
  uiManager.hideLobby();
  startGame(serverSeed);
});

// START CONNECTION - REMOVED (Handled by Menu)
// network.connect();

network.onMessage((data) => {
  if (remotePlayers[data.id]) {
    // Update Existing
    const p = remotePlayers[data.id];
    p.body.position.set(data.x, data.y, data.z);
    p.body.quaternion.set(data.rx, data.ry, data.rz, data.rw);
    p.body.velocity.set(data.vx, data.vy, data.vz);

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

function startGame(serverSeed) {
  try {
    console.log("Initializing Arena with Seed:" + serverSeed);
    // Use RANDOM_SQUARE with Server Seed
    arena = new Arena(
      scene,
      world,
      materials,
      GameConfig.game.playerCount,
      "RANDOM_SQUARE",
      serverSeed
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

    // Network Sync
    network.sendState(
      player.body.position,
      player.body.quaternion,
      player.body.velocity,
      myColor // <--- Sending Identity
    );

    // Update Remote Players
    Object.values(remotePlayers).forEach((p) => p.update(dt));

    // Update Obstacles via Arena
    arena.update();

    // Ring Out Logic
    if (player.body.position.y < arena.config.killY) {
      const respawnPos = arena.getRandomSpawnPoint();
      player.reset({ x: respawnPos.x, y: 5, z: respawnPos.z });
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
