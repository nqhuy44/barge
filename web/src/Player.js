import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Player {
    constructor(scene, world, position = { x: 0, y: 5, z: 0 }, color = 0xffff00, material = null, inputEnabled = true) {
        this.scene = scene;
        this.world = world;
        this.color = color;
        this.material = material;
        this.inputEnabled = inputEnabled;
        
        // FIX 1: Stats Heavy Drift
        this.stats = {
            mass: 50,           
            moveForce: 3000,    
            damping: 0.4,       
            maxSpeed: 15,
            bargeForce: 10000,
            bargeCooldown: 1.0,
            bargeMaxSpeed: 80 // New Cap for Barge
        };
        
        // FIX 2: Input Stack (Last Key Wins)
        this.inputStack = []; 
        this.input = { barge: false }; // Space bar check riêng

        this.bargeTimer = 0;
        this.animTime = 0;
        this.squashScale = new THREE.Vector3(1, 1, 1);

        this.initPhysics(position);
        this.initVisuals();
        this.setupInput();
    }

    initPhysics(pos) {
        const radius = 1.25; // Increased from 0.75
        const shape = new CANNON.Sphere(radius);
        
        this.body = new CANNON.Body({
            mass: this.stats.mass,
            shape: shape,
            linearDamping: this.stats.damping,
            position: new CANNON.Vec3(pos.x, pos.y, pos.z),
            material: this.material,
        });
        
        this.body.fixedRotation = true;
        this.body.updateMassProperties();
        this.body.allowSleep = false;
        this.world.addBody(this.body);
    }

    initVisuals() {
        // Radius 1.25, Length 1. Total Height = 2.5 + 1 = 3.5.
        const geometry = new THREE.CapsuleGeometry(1.25, 1, 4, 8);
        
        // Pivot at Bottom. Total Height/2 = 1.75.
        // Shift geometry up by 1.75 so origin is at bottom.
        geometry.translate(0, 1.75, 0); 

        const material = new THREE.MeshStandardMaterial({ 
            color: this.color, 
            roughness: 0.2,
            metalness: 0.1
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.scene.add(this.mesh);
    } 

    setupInput() {
        window.addEventListener('keydown', (e) => this.handleKey(e, true));
        window.addEventListener('keyup', (e) => this.handleKey(e, false));
    }

    handleKey(event, isPressed) {
        if (!this.inputEnabled) return;

        const code = event.code;

        if (code === 'Space') {
            this.input.barge = isPressed;
            return;
        }

        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
            if (isPressed) {
                if (!this.inputStack.includes(code)) {
                    this.inputStack.push(code);
                }
            } else {
                this.inputStack = this.inputStack.filter(k => k !== code);
            }
        }
    }

    update(dt) {
        // Input Vector (Last Key Wins)
        const inputVector = new CANNON.Vec3(0, 0, 0);

        const lastX = this.inputStack.slice().reverse().find(k => k === 'ArrowLeft' || k === 'ArrowRight');
        if (lastX === 'ArrowLeft') inputVector.x -= 1;
        if (lastX === 'ArrowRight') inputVector.x += 1;

        const lastZ = this.inputStack.slice().reverse().find(k => k === 'ArrowUp' || k === 'ArrowDown');
        if (lastZ === 'ArrowUp') inputVector.z -= 1;
        if (lastZ === 'ArrowDown') inputVector.z += 1;

        // Isometric Rotation (-45 deg)
        const angle = -Math.PI / 4; 
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        
        const finalX = inputVector.x * cos - inputVector.z * sin; 
        const finalZ = inputVector.x * sin + inputVector.z * cos;
        inputVector.set(finalX, 0, finalZ);

        if (inputVector.lengthSquared() > 0) {
            inputVector.normalize();
        }

        // Rotate Body
        if (inputVector.lengthSquared() > 0) {
            const angle = Math.atan2(inputVector.x, inputVector.z);
            const targetQuat = new CANNON.Quaternion();
            targetQuat.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), angle);
            this.body.quaternion.slerp(targetQuat, 0.1, this.body.quaternion);
        }

        // Physics Apply
        this.body.linearDamping = this.stats.damping;
        const isMoving = inputVector.lengthSquared() > 0;

        if (isMoving) {
            this.body.wakeUp();
            const force = new CANNON.Vec3(
                inputVector.x * this.stats.moveForce,
                0,
                inputVector.z * this.stats.moveForce
            );
            this.body.applyForce(force, this.body.position);
        }

        // Barge Logic
        if (this.bargeTimer > 0) this.bargeTimer -= dt;
        if (this.bargeWindow > 0) this.bargeWindow -= dt;

        if (this.input.barge && this.bargeTimer <= 0) {
            let bargeDir = inputVector.clone();
            if (bargeDir.lengthSquared() === 0) {
                const forward = new CANNON.Vec3(0, 0, 1);
                this.body.quaternion.vmult(forward, bargeDir);
            }
            bargeDir.normalize();

            const impulse = bargeDir.scale(this.stats.bargeForce);
            this.body.applyImpulse(impulse, this.body.position);
            
            this.bargeTimer = this.stats.bargeCooldown;
            this.bargeWindow = 0.1; // Burst duration 0.1s (User Request)
            this.squashScale.set(1.4, 0.6, 1.4);
        }

        // Speed Limit
        const vel = this.body.velocity;
        const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
        
        let limit = this.stats.maxSpeed;
        if (this.bargeWindow > 0) {
            limit = this.stats.bargeMaxSpeed;
        }

        if (speed > limit) {
            const ratio = limit / speed;
            vel.x *= ratio;
            vel.z *= ratio;
        } 
        
        // Animation
        this.animTime += dt;
        
        const baseScale = 1.0; 
        const targetScale = new THREE.Vector3(baseScale, baseScale, baseScale);

        this.squashScale.lerp(targetScale, 0.1);
        const breathe = 1 + Math.sin(this.animTime * 3) * 0.03;
        
        this.mesh.scale.copy(this.squashScale);
        if (!isMoving) {
             this.mesh.scale.y *= breathe;
        }

        // Sync Position
        this.mesh.position.copy(this.body.position);
        
        // Offset: 
        // Body Y is Center of Sphere (Radius 1.25).
        // Feet are at BodyY - 1.25.
        // Mesh Pivot is at Feet.
        this.mesh.position.y -= 1.25; 

        this.mesh.quaternion.copy(this.body.quaternion);
    }

    setMass(newMass) {
        this.stats.mass = newMass;
        this.body.mass = newMass;
        this.body.updateMassProperties();
    }
    
    reset(pos) {
        this.body.position.set(pos.x, pos.y, pos.z);
        this.body.velocity.set(0, 0, 0);
        this.body.angularVelocity.set(0, 0, 0);
        this.body.quaternion.set(0, 0, 0, 1);
        
        this.mesh.position.copy(this.body.position);
        this.mesh.position.y -= 1.25; // Reset offset match
        this.mesh.quaternion.copy(this.body.quaternion);
    }
}