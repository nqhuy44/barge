import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Obstacle {
    constructor(scene, world, config = {}) {
        this.scene = scene;
        this.world = world;
        this.config = config; // Store config for init() access        
        // Defaults
        this.type = config.type || 'BOX';
        this.pos = config.position || { x: 0, y: 0, z: 0 };
        this.size = config.size || { x: 1, y: 1, z: 1 }; // For Box/Cylinder
        this.radius = config.radius || 1; // For Sphere/Cylinder
        this.mass = config.mass !== undefined ? config.mass : 0; // Default Static
        this.color = config.color || 0x888888;
        this.material = config.material || null; // Physics material

        this.init();
    }

    init() {
        let geometry, shape;

        // 1. Geometry & Shape Factory
        switch (this.type) {
            case 'BOX':
                // ThreeJS: Full Size. CannonJS: Half Extents.
                geometry = new THREE.BoxGeometry(this.size.x, this.size.y, this.size.z);
                shape = new CANNON.Box(new CANNON.Vec3(this.size.x / 2, this.size.y / 2, this.size.z / 2));
                break;

            case 'SPHERE':
                geometry = new THREE.SphereGeometry(this.radius, 32, 32);
                shape = new CANNON.Sphere(this.radius);
                break;

            case 'CYLINDER': {
                // ThreeJS: radiusTop, radiusBottom, height, segments
                geometry = new THREE.CylinderGeometry(this.radius, this.radius, this.size.y, 32);
                
                // CannonJS: radiusTop, radiusBottom, height, segments
                shape = new CANNON.Cylinder(this.radius, this.radius, this.size.y, 16);
                
                const q = new CANNON.Quaternion();
                q.setFromAxisAngle(new CANNON.Vec3(1,0,0), -Math.PI/2); 
                break;
            }
                
            default:
                console.warn("Unknown Obstacle Type:", this.type);
                return;
        }

        // 2. Visual Mesh
        const material = new THREE.MeshStandardMaterial({ 
            color: this.color, 
            roughness: 0.1, 
            metalness: 0.1 
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);

        // 3. Physics Body
        this.body = new CANNON.Body({
            mass: this.mass,
            material: this.material,
            position: new CANNON.Vec3(this.pos.x, this.pos.y, this.pos.z)
        });

        // Handle Cylinder Rotation Quirk (Cannon=Z, Three=Y)
        if (this.type === 'CYLINDER') {
            const rot = new CANNON.Quaternion();
            rot.setFromAxisAngle(new CANNON.Vec3(1,0,0), -Math.PI/2);
            this.body.addShape(shape, new CANNON.Vec3(0,0,0), rot);
        } else {
            this.body.addShape(shape);
        }
        
        // Apply Initial Rotation if provided (e.g., for Ramps)
        if (this.config && this.config.rotation) {
            const { x, y, z } = this.config.rotation;
            this.body.quaternion.setFromEuler(x, y, z);
            
            // Sync Mesh immediately
            this.mesh.rotation.set(x, y, z);
            this.mesh.quaternion.copy(this.body.quaternion);
        }

        this.world.addBody(this.body);

        // Sync initial pos
        this.mesh.position.copy(this.body.position);
        this.mesh.quaternion.copy(this.body.quaternion);
    }

    update() {
        // dynamic objects need sync
        if (this.mass > 0) {
            this.mesh.position.copy(this.body.position);
            this.mesh.quaternion.copy(this.body.quaternion);
        }
    }
}
