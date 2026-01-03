import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Player {
    constructor(scene, world, position = { x: 0, y: 5, z: 0 }, color = 0xffff00, material = null, inputEnabled = true) {
        this.scene = scene;
        this.world = world;
        this.color = color;
        this.material = material;
        this.inputEnabled = inputEnabled;
        
        // FIX: Natural Drag Physics & Soft Cap
        this.stats = {
            mass: 80,
            moveForce: 20000,   // High acceleration
            damping: 0.9,       // 0.9 = Snappy/Tight stop (Mud-like). Change to 0.99 for Ice.
            maxSpeed: 20,       // Strict Speed Limit
            bargeForce: 7500,
            bargeCooldown: 1.0,
            bargeDuration: 0.3
        };
        // FIX 2: Input Stack (Last Key Wins)
        this.inputStack = []; 
        this.bargeTimer = 0;   // Cooldown timer
        this.bargeActiveTimer = 0; // Duration timer (Active State)
        this.isBarging = false;
        this.input = { barge: false };
        this.animTime = 0;
        this.squashScale = new THREE.Vector3(1, 1, 1);

        // ARCHITECTURE CHANGE: Visual Root Container
        this.visualRoot = new THREE.Group();
        this.scene.add(this.visualRoot);

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
            linearDamping: 0,
            position: new CANNON.Vec3(pos.x, pos.y, pos.z),
            material: this.material,
        });
        
        this.body.fixedRotation = true;
        this.body.updateMassProperties();
        this.body.allowSleep = false;
        this.world.addBody(this.body);
    }

    initVisuals() {
        this.skinMesh = this.createDefaultSkin(this.color);
        this.visualRoot.add(this.skinMesh);
    } 

    createDefaultSkin(color) {
        // Radius 1.25, Length 1. Total Height = 2.5 + 1 = 3.5.
        const geometry = new THREE.CapsuleGeometry(1.25, 1, 4, 8);
        
        // Pivot at Bottom. Total Height/2 = 1.75.
        // Shift geometry up by 1.75 so origin is at bottom.
        geometry.translate(0, 1.75, 0); 

        const material = new THREE.MeshStandardMaterial({ 
            color: color, 
            roughness: 0.2,
            metalness: 0.1
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        return mesh;
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
        // --- 1. INPUT (Keep existing logic) ---
        const inputVector = new CANNON.Vec3(0, 0, 0);
        const lastX = this.inputStack.slice().reverse().find(k => k === 'ArrowLeft' || k === 'ArrowRight');
        if (lastX === 'ArrowLeft') inputVector.x -= 1;
        if (lastX === 'ArrowRight') inputVector.x += 1;
        const lastZ = this.inputStack.slice().reverse().find(k => k === 'ArrowUp' || k === 'ArrowDown');
        if (lastZ === 'ArrowUp') inputVector.z -= 1;
        if (lastZ === 'ArrowDown') inputVector.z += 1;

        // Isometric Rotate
        const angle = -Math.PI / 4; 
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        const finalX = inputVector.x * cos - inputVector.z * sin; 
        const finalZ = inputVector.x * sin + inputVector.z * cos;
        inputVector.set(finalX, 0, finalZ);
        if (inputVector.lengthSquared() > 0) inputVector.normalize();

        // Rotate Visuals
        if (inputVector.lengthSquared() > 0) {
            const rotAngle = Math.atan2(inputVector.x, inputVector.z);
            const targetQuat = new CANNON.Quaternion();
            targetQuat.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotAngle);
            this.body.quaternion.slerp(targetQuat, 0.1, this.body.quaternion);
        }

        // --- 2. DECOUPLED PHYSICS CORE ---

        // A. Disable System Damping -> Heavy Gravity works fully
        this.body.linearDamping = 0;

        const isGrounded = this.body.position.y < 2.5;

        // B. Apply Terrain Damping (Independent of Speed)
        // 0.9 = Stops fast. 0.99 = Slides far.
        // Math.pow ensures consistent behavior across 60/144Hz.
        const baseDamping = isGrounded ? this.stats.damping : 0.99; 
        const timeFactor = dt * 60;
        const effectiveDamping = Math.pow(baseDamping, timeFactor);

        this.body.velocity.x *= effectiveDamping;
        this.body.velocity.z *= effectiveDamping;

        // C. Apply Force (Limited by MaxSpeed, NOT Friction)
        const isMoving = inputVector.lengthSquared() > 0;
        
        if (isMoving) {
            this.body.wakeUp();
            
            // Check Current Speed
            const currentVel = new CANNON.Vec3(this.body.velocity.x, 0, this.body.velocity.z);
            const currentSpeed = currentVel.length();

            // SOFT CAP: Only accelerate if below Max Speed
            if (currentSpeed < this.stats.maxSpeed) {
                const forceMag = isGrounded ? this.stats.moveForce : (this.stats.moveForce * 0.3);
                
                const force = new CANNON.Vec3(
                    inputVector.x * forceMag,
                    0,
                    inputVector.z * forceMag
                );
                this.body.applyForce(force, this.body.position);
            }
        }

        // --- 3. BARGE & ANIMATION (Keep existing) ---
        // Barge Logic
        if (this.bargeTimer > 0) this.bargeTimer -= dt;
        if (this.bargeActiveTimer > 0) {
            this.bargeActiveTimer -= dt;
            if (this.bargeActiveTimer <= 0) {
                this.isBarging = false;
                this.squashScale.set(1, 1, 1); 
            }
        }
        if (this.input.barge && this.bargeTimer <= 0) {
            this.isBarging = true;
            this.bargeActiveTimer = this.stats.bargeDuration;
            this.bargeTimer = this.stats.bargeCooldown;
            let bargeDir = inputVector.clone();
            if (bargeDir.lengthSquared() === 0) {
                const forward = new CANNON.Vec3(0, 0, 1);
                this.body.quaternion.vmult(forward, bargeDir);
            }
            bargeDir.normalize();
            
            const impulse = bargeDir.scale(this.stats.bargeForce);
            this.body.applyImpulse(impulse, this.body.position);
            this.squashScale.set(1.4, 0.6, 1.4);
        }

        // Animation
        this.animTime += dt;
        const targetScale = new THREE.Vector3(1, 1, 1);
        this.squashScale.lerp(targetScale, 0.1);
        const breathe = 1 + Math.sin(this.animTime * 3) * 0.03;
        this.skinMesh.scale.copy(this.squashScale);
        if (!isMoving) this.skinMesh.scale.y *= breathe;

        this.visualRoot.position.copy(this.body.position);
        this.visualRoot.position.y -= 1.25; 
        this.visualRoot.quaternion.copy(this.body.quaternion);
    }

    setMass(newMass) {
        this.stats.mass = newMass;
        this.body.mass = newMass;
        this.body.updateMassProperties();
    }

    setSkinColor(color) {
        this.color = color;
        if (this.skinMesh && this.skinMesh.material) {
            this.skinMesh.material.color.setHex(color);
        }
    }
    
    reset(pos) {
        this.body.position.set(pos.x, pos.y, pos.z);
        this.body.velocity.set(0, 0, 0);
        this.body.angularVelocity.set(0, 0, 0);
        this.body.quaternion.set(0, 0, 0, 1);
        
        this.body.quaternion.set(0, 0, 0, 1);
        
        this.visualRoot.position.copy(this.body.position);
        this.visualRoot.position.y -= 1.25; // Reset offset match
        this.visualRoot.quaternion.copy(this.body.quaternion);
    }
}