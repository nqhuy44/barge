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

const playerContactMat = new CANNON.ContactMaterial(playerMaterial, defaultMaterial, {
    friction: 0.05, // Drastically reduced for sliding (was 0.3)
    restitution: 0.7, 
});
const playerPlayerMat = new CANNON.ContactMaterial(playerMaterial, playerMaterial, {
    friction: 0.3,
    restitution: 0.9, 
});

world.addContactMaterial(playerContactMat);
world.addContactMaterial(playerPlayerMat);

// --- Objects ---

// 1. Arena (Sumo Circle)
const ROW_OUT_Y = -10;

// Visuals (Giữ nguyên hình tròn cho đẹp)
const arenaRadius = 20;
const arenaHeight = 2;
const arenaGeometry = new THREE.CylinderGeometry(arenaRadius, arenaRadius, arenaHeight, 32);
const arenaMaterial = new THREE.MeshLambertMaterial({ color: 0x2a2a3e });
const arenaMesh = new THREE.Mesh(arenaGeometry, arenaMaterial);
arenaMesh.position.y = -1; 
arenaMesh.receiveShadow = true;
scene.add(arenaMesh);

// Physics (FIX QUAN TRỌNG: Dùng BOX để không bị kẹt)
// Tạo một cái hộp rộng 40x40 (HalfExtents 20) để làm sàn phẳng lì
const arenaShape = new CANNON.Box(new CANNON.Vec3(20, 1, 20));
const arenaBody = new CANNON.Body({
    mass: 0, // Static
    material: defaultMaterial,
});
arenaBody.addShape(arenaShape);
arenaBody.position.set(0, -1, 0); 
world.addBody(arenaBody); 

// --- Game Loop ---
const timeStep = 1 / 60; 

// 2. Player
const player = new Player(scene, world, { x: 0, y: 2, z: 0 }, 0xffff00, playerMaterial);

// 3. Dummy (Target)
const dummy = new Player(scene, world, { x: 5, y: 2, z: 5 }, 0xffff00, playerMaterial, false); 
dummy.setMass(50); 
dummy.skinMesh.material.color.setHex(0xffff00); // Yellow
player.skinMesh.material.color.setHex(0xff0000); // Red

// 3. Camera Controller
const cameraController = new CameraController(camera, player);

// Force sync
player.update(timeStep); 
cameraController.update(timeStep, true);

function animate() {
    requestAnimationFrame(animate);

    stats.begin();
    world.fixedStep(timeStep);

    player.update(timeStep);
    dummy.update(timeStep);

    // Ring Out Logic
    if (player.body.position.y < ROW_OUT_Y) {
        player.reset({ x: 0, y: 2, z: 0 });
    }
    if (dummy.body.position.y < ROW_OUT_Y) {
        dummy.reset({ x: 5, y: 2, z: 5 });
        dummy.body.velocity.set(0,0,0);
    }

    cameraController.update(timeStep);

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