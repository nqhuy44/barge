import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Obstacle } from './Obstacle.js';

export class Arena {
    constructor(scene, world, materials, playerCount = 2, mode = 'FIXED_SQUARE', seed = 12345) {
        this.scene = scene;
        this.world = world;
        this.materials = materials; // { default, obstacle }
        this.playerCount = playerCount;
        this.mode = mode; 
        this.seed = seed;
        
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

    // Simple Linear Congruential Generator (LCG) for MVP
    seededRandom() {
        // A simple LCG: x = (a * x + c) % m
        // Modulus 2^31 - 1 = 2147483647
        this.seed = (1664525 * this.seed + 1013904223) % 2147483647;
        return this.seed / 2147483647;
    }

    init() {
        if (this.mode === 'RANDOM_CIRCLE') {
            this.createRandomCircleMap();
        } else if (this.mode === 'FIXED_SQUARE' || this.mode === 'RANDOM_SQUARE') {
            this.createRandomSquareMap();
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

    // --- MAP 3: SQUARE (Scattered Tactical Terrain) ---
    createRandomSquareMap() {
        // 1. Calculate Random Density for this match (0% to 20%)
        const density = this.seededRandom() * 0.20;
        
        console.log(`Generating TERRAIN map (Seed: ${this.seed}, Density: ${(density*100).toFixed(1)}%)`);
        
        // 2. Aesthetics
        const FLOOR_COLOR = 0xeeeeee;
        const WALL_COLOR = 0xffffff; 
        
        this.createFloorSquare(this.radius, FLOOR_COLOR);
        const obstacleMaterial = this.materials.obstacle;

        // --- CONFIGURATION ---
        const WALL_HEIGHT = 2;
        const RAMP_THICKNESS = 20;   
        const GRID_SIZE = 8;         
        
        // Bounds: Radius - 6 (Keep walls inside)
        const spawnRange = this.radius - 6; 

        // 3. COUNT BASED ON RANDOM DENSITY
        const totalArea = (spawnRange * 2) * (spawnRange * 2);
        const cellArea = GRID_SIZE * GRID_SIZE;
        const OBSTACLE_COUNT = Math.floor((totalArea / cellArea) * density); 

        for (let i = 0; i < OBSTACLE_COUNT; i++) {
            // DIMENSIONS
            const length = 4 + this.seededRandom() * 6; // 4-10m
            const width = 1 + this.seededRandom() * 3;  // 1-4m
            const isHorizontal = this.seededRandom() > 0.5;

            const size = {
                x: isHorizontal ? length : width,
                y: WALL_HEIGHT,
                z: isHorizontal ? width : length
            };

            // POSITION
            let rawX = (this.seededRandom() * spawnRange * 2) - spawnRange;
            let rawZ = (this.seededRandom() * spawnRange * 2) - spawnRange;
            
            const x = Math.round(rawX / GRID_SIZE) * GRID_SIZE;
            const z = Math.round(rawZ / GRID_SIZE) * GRID_SIZE;

            // Safe Zone
            if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;

            // SPAWN WALL
            this.addObstacle({
                type: 'BOX',
                position: { x, y: WALL_HEIGHT / 2, z },
                size: size,
                mass: 0,
                color: WALL_COLOR,
                material: obstacleMaterial
            });

            // ATTACHED RAMP (20% Chance - Keep this relative to wall count)
            if (this.seededRandom() < 0.2) {
                const rampRun = 2 + this.seededRandom() * 2;
                const rampRise = WALL_HEIGHT;
                
                const rampHypotenuse = Math.sqrt(rampRun**2 + rampRise**2);
                const rampAngle = Math.atan(rampRise / rampRun);

                const rampY = (rampRise / 2) - (RAMP_THICKNESS / 2) * Math.cos(rampAngle);
                const shiftH = (RAMP_THICKNESS / 2) * Math.sin(rampAngle);

                const dir = this.seededRandom() > 0.5 ? 1 : -1;
                let rampPos, rampRot, rampSize;
                const rampWidth = width;

                if (isHorizontal) {
                    const centerX = x + ((length / 2) + (rampRun / 2) - shiftH) * dir;
                    rampPos = { x: centerX, y: rampY, z: z };
                    rampRot = { x: 0, y: 0, z: -dir * rampAngle };
                    rampSize = { x: rampHypotenuse, y: RAMP_THICKNESS, z: rampWidth };
                } else {
                    const centerZ = z + ((length / 2) + (rampRun / 2) - shiftH) * dir;
                    rampPos = { x: x, y: rampY, z: centerZ };
                    rampRot = { x: dir * rampAngle, y: 0, z: 0 };
                    rampSize = { x: rampWidth, y: RAMP_THICKNESS, z: rampHypotenuse };
                }

                this.addObstacle({
                    type: 'BOX',
                    position: rampPos,
                    size: rampSize,
                    rotation: rampRot,
                    mass: 0,
                    color: WALL_COLOR,
                    material: obstacleMaterial
                });
            }
        }
    }

    // --- HELPERS ---
    getObstacleMaterial() {
        return this.materials.obstacle || new CANNON.Material('obstacle');
    }

    createFloorCircle(radius) {
        // Visuals (Cylinder)
        const geo = new THREE.CylinderGeometry(radius, radius, 2, 32);
        const mat = new THREE.MeshLambertMaterial({ color: 0x2a2a3e });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = -1;
        mesh.receiveShadow = true;
        this.scene.add(mesh);

        // Physics (Box Approximation - Legacy Stick Fix)
        const shape = new CANNON.Box(new CANNON.Vec3(radius, 1, radius));
        this.floorBody = new CANNON.Body({ 
            mass: 0,
            material: this.materials.default || new CANNON.Material('default')
        });
        this.floorBody.addShape(shape);
        this.floorBody.position.set(0, -1, 0);
        this.world.addBody(this.floorBody);
    }

    createFloorSquare(halfSize, color = 0x2a2a3e) {
        // Visuals (Box) - Matches Physics!
        const size = halfSize * 2;
        const geo = new THREE.BoxGeometry(size, 2, size);
        const mat = new THREE.MeshLambertMaterial({ color: color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = -1;
        mesh.receiveShadow = true;
        this.scene.add(mesh);

        // Physics (Box)
        const shape = new CANNON.Box(new CANNON.Vec3(halfSize, 1, halfSize));
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

    // Circular Slots
    getSpawnPoint(index, totalPlayers) {
        const angle = (index / totalPlayers) * Math.PI * 2;
        const spawnDist = this.radius * 0.6; 
        return {
            x: Math.cos(angle) * spawnDist,
            z: Math.sin(angle) * spawnDist
        };
    }

    // Completely Random Safe Spot (Client Side)
    getRandomSpawnPoint() {
        // Square area 80% of radius
        const range = this.radius * 0.8; 
        const x = (Math.random() * 2 - 1) * range;
        const z = (Math.random() * 2 - 1) * range;
        return { x: x, z: z };
    }
}
