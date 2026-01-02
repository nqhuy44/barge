import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Obstacle } from './Obstacle.js';

export class Arena {
    constructor(scene, world, materials, playerCount = 2, mode = 'FIXED_SUMO') {
        this.scene = scene;
        this.world = world;
        this.materials = materials; // { default, obstacle }
        this.playerCount = playerCount;
        this.mode = mode; 
        
        this.obstacles = []; 
        this.floorBody = null; 

        // Dynamic Radius Logic
        this.radius = 15 + (playerCount * 2); 
        this.radius = Math.max(20, Math.min(this.radius, 60));

        this.config = {
            killY: -5,
            spawnRadius: this.radius * 0.6 
        };

        this.init();
    }

    init() {
        if (this.mode === 'RANDOM_CIRCLE') {
            this.createRandomCircleMap();
        } else {
            this.createFixedSumoMap();
        }
    }

    // --- MAP 1: FIXED (For Physics Testing) ---
    createFixedSumoMap() {
        console.log(`Generating FIXED map with Radius ${this.radius}`);
        this.createFloorCircle(this.radius);

        const obstacleMaterial = this.getObstacleMaterial();

        // 1. Static Wall (Test Recoil)
        this.addObstacle({
            type: 'BOX',
            position: { x: -5, y: 1, z: -5 },
            size: { x: 10, y: 2, z: 2 },
            mass: 0,
            color: 0x9900ff,
            material: obstacleMaterial
        });

        // 2. Dynamic Crate (Test Impact)
        this.addObstacle({
            type: 'BOX',
            position: { x: 5, y: 5, z: 5 },
            size: { x: 2, y: 2, z: 2 },
            mass: 5,
            color: 0x8B4513,
            material: obstacleMaterial
        });
        
        // 3. Stone Pillar
        this.addObstacle({
            type: 'CYLINDER',
            position: { x: 0, y: 2, z: -10 },
            size: { x: 0, y: 4, z: 0 }, 
            radius: 1,
            mass: 0,
            color: 0x808080,
            material: obstacleMaterial
        });

        // 4. Giant Ball
        this.addObstacle({
            type: 'SPHERE',
            position: { x: -5, y: 5, z: 5 },
            radius: 1.5,
            mass: 20,
            color: 0xff0000,
            material: obstacleMaterial
        });
    }

    // --- MAP 2: RANDOM (Procedural) ---
    createRandomCircleMap() {
        console.log(`Generating RANDOM map with Radius ${this.radius}`);
        this.createFloorCircle(this.radius);
        
        const obstacleMaterial = this.getObstacleMaterial();

        const obstacleCount = Math.floor(this.radius / 1.5); 

        for (let i = 0; i < obstacleCount; i++) {
            // Random Polar Coordinates
            const r = Math.random() * (this.radius - 4); 
            const theta = Math.random() * Math.PI * 2;
            
            const x = r * Math.cos(theta);
            const z = r * Math.sin(theta);

            // Avoid Center (Safe Zone)
            if (Math.abs(x) < 5 && Math.abs(z) < 5) continue;

            const isDynamic = Math.random() > 0.4; // 60% chance dynamic

            this.addObstacle({
                type: isDynamic ? 'BOX' : 'CYLINDER',
                position: { x: x, y: isDynamic ? 5 : 2, z: z },
                size: isDynamic ? {x:2, y:2, z:2} : {x:1.5, y:4},
                radius: isDynamic ? 0 : 1, // Cylinder radius
                mass: isDynamic ? 5 : 0,
                color: isDynamic ? 0x8B4513 : 0x808080,
                material: obstacleMaterial
            });
        }
    }

    // --- HELPERS ---
    getObstacleMaterial() {
        return this.materials.obstacle || new CANNON.Material('obstacle');
    }

    createFloorCircle(radius) {
        // Visuals
        const geo = new THREE.CylinderGeometry(radius, radius, 2, 32);
        const mat = new THREE.MeshLambertMaterial({ color: 0x2a2a3e });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = -1;
        mesh.receiveShadow = true;
        this.scene.add(mesh);

        // Physics (Box Approximation for sliding)
        // Note: Using a Box for the floor is a hack to prevent sticking on mesh edges of trimesh/heightfield?
        // Or just preference. The prompt used Box(radius, 1, radius).
        const shape = new CANNON.Box(new CANNON.Vec3(radius, 1, radius));
        this.floorBody = new CANNON.Body({ 
            mass: 0,
            material: this.materials.default || new CANNON.Material('default')
        });
        this.floorBody.addShape(shape);
        this.floorBody.position.set(0, -1, 0);
        this.world.addBody(this.floorBody);
    }

    addObstacle(config) {
        const obs = new Obstacle(this.scene, this.world, config);
        this.obstacles.push(obs);
    }

    update() {
        this.obstacles.forEach(obs => obs.update());
    }

    getSpawnPoint(index, totalPlayers) {
        const angle = (index / totalPlayers) * Math.PI * 2;
        const spawnDist = this.radius * 0.6; 
        return {
            x: Math.cos(angle) * spawnDist,
            z: Math.sin(angle) * spawnDist
        };
    }
}
