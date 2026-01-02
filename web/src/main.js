import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import CannonDebugger from 'cannon-es-debugger';
import Stats from 'stats.js';
import GUI from 'lil-gui';
import { Player } from './Player.js';
import { CameraController } from './CameraController.js';
import { Arena } from './Arena.js';

// --- Configuration ---
const config = {
    debugPhysics: true,
};
const timeStep = 1 / 60;

// --- Scene & Camera ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000033); // Dark Blue

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
world.gravity.set(0, -9.82, 0);

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
const PLAYER_COUNT = 2; 
const materials = {
    default: defaultMaterial,
    obstacle: obstacleMaterial
};
// Mode: 'FIXED_SUMO' (Test) or 'RANDOM_CIRCLE' (Chaos)
// Mode: 'FIXED_SUMO' (Test) or 'RANDOM_CIRCLE' (Chaos)
let arena, player, dummy, p1Spawn, p2Spawn, cameraController;

try {
    console.log("Initializing Arena...");
    arena = new Arena(scene, world, materials, PLAYER_COUNT, 'FIXED_SQUARE'); 

    // 2. Players (Use Arena Spawn Points)
    p1Spawn = arena.getSpawnPoint(0, PLAYER_COUNT);
    player = new Player(scene, world, { x: p1Spawn.x, y: 5, z: p1Spawn.z }, 0xffff00, playerMaterial);

    p2Spawn = arena.getSpawnPoint(1, PLAYER_COUNT);
    dummy = new Player(scene, world, { x: p2Spawn.x, y: 5, z: p2Spawn.z }, 0xffff00, playerMaterial, false); 
    dummy.setMass(50); 
    dummy.skinMesh.material.color.setHex(0xffff00); // Yellow
    player.skinMesh.material.color.setHex(0xff0000); // Red

    // 3. Camera Controller
    cameraController = new CameraController(camera, player);

    // Force sync
    player.update(timeStep); 
    cameraController.update(timeStep, true);
} catch (e) {
    console.error("CRITICAL INIT ERROR:", e);
    alert("Init Error: " + e.message);
}

function animate() {
    requestAnimationFrame(animate);

    stats.begin();
    world.fixedStep(timeStep);

    // Safe Update Loop
    if (player && dummy && arena && cameraController) {
        player.update(timeStep);
        dummy.update(timeStep);
        
        // Update Obstacles via Arena
        arena.update();

        // Ring Out Logic
        if (player.body.position.y < arena.config.killY) {
            player.reset({ x: p1Spawn.x, y: 5, z: p1Spawn.z });
        }
        if (dummy.body.position.y < arena.config.killY) {
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

animate();