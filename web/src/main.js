import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import CannonDebugger from 'cannon-es-debugger';
import Stats from 'stats.js';
import GUI from 'lil-gui';
import { Player } from './Player.js';
import { CameraController } from './CameraController.js';

// --- Configuration ---
const config = {
    debugPhysics: true,
};

// --- Scene & Camera ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000033); // Dark Blue

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
// Initial position, will be updated by follow logic
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

// --- Materials (Bounce & Friction) ---
const defaultMaterial = new CANNON.Material('default');
const playerMaterial = new CANNON.Material('player');

const playerContactMat = new CANNON.ContactMaterial(playerMaterial, defaultMaterial, {
    friction: 0.3,
    restitution: 0.7, // Bouncy!
});
const playerPlayerMat = new CANNON.ContactMaterial(playerMaterial, playerMaterial, {
    friction: 0.3,
    restitution: 0.9, // Extra Bouncy on collision!
});

world.addContactMaterial(playerContactMat);
world.addContactMaterial(playerPlayerMat);

// --- Objects ---

// 1. Arena (Sumo Circle)
const ROW_OUT_Y = -10;

// Visuals
const arenaRadius = 20;
const arenaHeight = 2;
const arenaGeometry = new THREE.CylinderGeometry(arenaRadius, arenaRadius, arenaHeight, 32);
const arenaMaterial = new THREE.MeshLambertMaterial({ color: 0x2a2a3e });
const arenaMesh = new THREE.Mesh(arenaGeometry, arenaMaterial);
arenaMesh.position.y = -1; // Top surface at y=0
arenaMesh.receiveShadow = true;
scene.add(arenaMesh);

// Physics
const arenaShape = new CANNON.Cylinder(arenaRadius, arenaRadius, arenaHeight, 32);
const arenaBody = new CANNON.Body({
    mass: 0, // Static
    material: defaultMaterial,
});
// Simplify cylinder orientation for Cannon (Cannon cylinder axis is Z?)
// Actually Cannon ES cylinder is Y-up usually, same as Three.
// But Trimesh is safer if issues arise, but Cylinder is performant.
// Cannon Cylinder is usually oriented such that Y is the axis.
arenaBody.addShape(arenaShape, new CANNON.Vec3(0, 0, 0)); 
arenaBody.position.set(0, -1, 0);
world.addBody(arenaBody); 
// --- Game Loop ---
const timeStep = 1 / 60; 

// 2. Player
const player = new Player(scene, world, { x: 0, y: 5, z: 0 }, 0xffff00, playerMaterial);

// 3. Dummy (Target)
const dummy = new Player(scene, world, { x: 5, y: 5, z: 5 }, 0xffff00, playerMaterial, false); // Input Disabled
dummy.setMass(50); // Lighter than player (100)
// Color Override for Dummy logic if needed, but constructor uses passed color. 
// Let's change dummy mesh color manually if constructor doesn't support changing it easily after init?
// Actually construct param color works. 0xffff00 is Yellow. Player is 0xffff00. 
// Wait, Player default is 0xffff00. 
// Let's make Player Red and Dummy Yellow.
dummy.mesh.material.color.setHex(0xffff00); // Yellow
player.mesh.material.color.setHex(0xff0000); // Red

// 3. Camera Controller
const cameraController = new CameraController(camera, player);

// Force sync for first frame to ensure visual match
player.update(timeStep); 
cameraController.update(timeStep, true);

function animate() {
    requestAnimationFrame(animate);

    stats.begin();

    // Update Physics
    world.fixedStep(timeStep);

    // Update Player & Dummy
    player.update(timeStep);
    dummy.update(timeStep);

    // Ring Out Logic
    if (player.body.position.y < ROW_OUT_Y) {
        player.reset({ x: 0, y: 5, z: 0 });
    }
    if (dummy.body.position.y < ROW_OUT_Y) {
        dummy.reset({ x: 5, y: 5, z: 5 });
        dummy.body.velocity.set(0,0,0); // Ensure stop
        // Make dummy flash white? (Later)
    }

    // Camera Follow
    cameraController.update(timeStep);

    // Debug View
    if (config.debugPhysics) {
        cannonDebugger.update();
    }

    renderer.render(scene, camera);

    stats.end();
}

// --- Resize Handler ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
console.log("Barge Core Control Initialized!");
