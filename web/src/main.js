import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import CannonDebugger from 'cannon-es-debugger';
import Stats from 'stats.js';
import GUI from 'lil-gui';
import { Player } from './Player.js';
import { CameraController } from './CameraController.js';
import { Arena } from './Arena.js';
import { NetworkManager } from './NetworkManager.js';

// --- Configuration ---
const config = {
    debugPhysics: true,
};
const timeStep = 1 / 60;

// --- Scene & Camera ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcccccc);
scene.fog = new THREE.Fog(0xcccccc, 20, 60);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
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
world.gravity.set(0, -30, 0);

// --- Debug Tools ---
const stats = new Stats();
document.body.appendChild(stats.dom);

const gui = new GUI();
gui.add(config, 'debugPhysics').name('Show Wireframes');

const cannonDebugger = new CannonDebugger(scene, world, {
    color: 0xff0000,
});

// --- Materials ---
const defaultMaterial = new CANNON.Material('default');
const playerMaterial = new CANNON.Material('player');
const obstacleMaterial = new CANNON.Material('obstacle'); // New Material

const playerContactMat = new CANNON.ContactMaterial(playerMaterial, defaultMaterial, {
    friction: 0.05, 
    restitution: 0.7, 
});
const playerPlayerMat = new CANNON.ContactMaterial(playerMaterial, playerMaterial, {
    friction: 0.3,
    restitution: 0.9, 
});
const playerObstacleMat = new CANNON.ContactMaterial(playerMaterial, obstacleMaterial, {
    friction: 0.1,
    restitution: 0.7, // Realistic Bounce (was 1.5)
});

world.addContactMaterial(playerContactMat);
world.addContactMaterial(playerPlayerMat);
world.addContactMaterial(playerObstacleMat);

// --- Objects ---

// 1. Arena System
const PLAYER_COUNT = 8; 
const materials = {
    default: defaultMaterial,
    obstacle: obstacleMaterial
};
// Mode: 'FIXED_SUMO' (Test) or 'RANDOM_CIRCLE' (Chaos)
// Mode: 'FIXED_SUMO' (Test) or 'RANDOM_CIRCLE' (Chaos)
let arena, player, dummy, p1Spawn, p2Spawn, cameraController;
let network;
const remotePlayers = {};
const PALETTE = [0xFF5555, 0x50FA7B, 0xF1FA8C, 0xBD93F9, 0x8BE9FD]; // Red, Green, Yellow, Purple, Cyan
const myColor = PALETTE[Math.floor(Math.random() * PALETTE.length)];

// 1. Setup Networking First
network = new NetworkManager();
network.connect();

// 2. Wait for Game Start (Seed)
network.onGameStart((serverSeed) => {
    startGame(serverSeed);
});

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
    } else if (data.type === 'PLAYER_LEFT') {
        const p = remotePlayers[data.id];
        if (p) {
            console.log(`Player Left: ${data.id}`);
            scene.remove(p.visualRoot);
            world.removeBody(p.body);
            delete remotePlayers[data.id];
        }
    } else {
        // Spawn New Remote Player
        console.log(`Spawn Remote Player: ${data.id} (${data.color})`);
        const p = new Player(scene, world, { x: data.x, y: data.y, z: data.z }, data.color || 0x00ffff, playerMaterial, false);
        p.setMass(80); // Ensure mass matches
        remotePlayers[data.id] = p;
    }
});

function startGame(serverSeed) {
    try {
        console.log("Initializing Arena with Seed:" + serverSeed);
        // Use RANDOM_SQUARE with Server Seed
        arena = new Arena(scene, world, materials, PLAYER_COUNT, 'RANDOM_SQUARE', serverSeed); 

        // 2. Players (Use Random Spawn)
        // Ensure strictly different positions by using random float range
        const p1Spawn = arena.getRandomSpawnPoint();
        player = new Player(scene, world, { x: p1Spawn.x, y: 5, z: p1Spawn.z }, myColor, playerMaterial);

        cameraController = new CameraController(camera, player);

        // Force sync
        player.update(timeStep); 
        cameraController.update(timeStep, true);

        // Start Loop
        animate();

    } catch (e) {
        console.error("CRITICAL INIT ERROR:", e);
        alert("Init Error: " + e.message);
    }
}

function animate() {
    requestAnimationFrame(animate);

    stats.begin();
    world.fixedStep(timeStep);

    // Safe Update Loop
    if (player && arena && cameraController) {
        player.update(timeStep);
        if (dummy) dummy.update(timeStep);

        // Network Sync
        network.sendState(
            player.body.position, 
            player.body.quaternion, 
            player.body.velocity,
            myColor // <--- Sending Identity
        );

        // Update Remote Players
        Object.values(remotePlayers).forEach(p => p.update(timeStep));
        
        // Update Obstacles via Arena
        arena.update();

        // Ring Out Logic
        if (player.body.position.y < arena.config.killY) {
            const respawnPos = arena.getRandomSpawnPoint();
            player.reset({ x: respawnPos.x, y: 5, z: respawnPos.z });
        }
        if (dummy && dummy.body.position.y < arena.config.killY) {
            dummy.reset({ x: p2Spawn.x, y: 5, z: p2Spawn.z });
            dummy.body.velocity.set(0,0,0);
        }

        cameraController.update(timeStep);
    }

    if (config.debugPhysics) {
        cannonDebugger.update();
    }

    renderer.render(scene, camera);
    stats.end();
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Remove auto-start animate()
// animate();