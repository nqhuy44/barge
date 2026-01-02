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
            moveForce: 7000,    // Snappy acceleration
            damping: 0.9,       // High drag
            maxSpeed: 20,       // Soft Cap
            bargeForce: 5000,   // Reduced from 14000 to prevent flying off map (Target Speed ~60)
            bargeCooldown: 1.0,
            bargeDuration: 0.3  // Short visual burst
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

        // Physics Apply: SOFT SPEED CAP
        this.body.linearDamping = this.stats.damping;
        const currentSpeed = this.body.velocity.length();
        const isMoving = inputVector.lengthSquared() > 0;

        // Apply Force ONLY if below Max Speed (Soft Cap)
        // This allows impulses (Barge/Collision) to push velocity WAY higher than 20.
        // But the player's engine stops adding force once 20 is reached.
        if (isMoving && currentSpeed < this.stats.maxSpeed) {
            this.body.wakeUp();
            const force = new CANNON.Vec3(
                inputVector.x * this.stats.moveForce,
                0,
                inputVector.z * this.stats.moveForce
            );
            this.body.applyForce(force, this.body.position);
        } else if (isMoving) {
            // Wake up even if speed capped, to keep simulation active
            this.body.wakeUp();
        }

        // Barge Logic
        if (this.bargeTimer > 0) this.bargeTimer -= dt;
        if (this.bargeActiveTimer > 0) {
            this.bargeActiveTimer -= dt;
            if (this.bargeActiveTimer <= 0) {
                this.isBarging = false;
                // Reset scale on finish
                this.squashScale.set(1, 1, 1); 
            }
        }

        if (this.input.barge && this.bargeTimer <= 0) {
            // Activate Barge
            this.isBarging = true;
            this.bargeActiveTimer = this.stats.bargeDuration; // 0.5s Active
            this.bargeTimer = this.stats.bargeCooldown;

            // Apply Massive Impulse
            let bargeDir = inputVector.clone();
            if (bargeDir.lengthSquared() === 0) {
                const forward = new CANNON.Vec3(0, 0, 1);
                this.body.quaternion.vmult(forward, bargeDir);
            }
            bargeDir.normalize();

            const impulse = bargeDir.scale(this.stats.bargeForce);
            this.body.applyImpulse(impulse, this.body.position);
            
            // Visual Flare
            this.squashScale.set(1.4, 0.6, 1.4);
        }

        // Removed Hard Speed Clamp completely.
        // Damping (0.9) will naturally decay any speed over 20. 
        
        // Animation
        this.animTime += dt;
        
        const baseScale = 1.0; 
        const targetScale = new THREE.Vector3(baseScale, baseScale, baseScale);

        this.squashScale.lerp(targetScale, 0.1);
        const breathe = 1 + Math.sin(this.animTime * 3) * 0.03;
        
        // Scale the SKIN, not the ROOT
        this.skinMesh.scale.copy(this.squashScale);
        if (!isMoving) {
             this.skinMesh.scale.y *= breathe;
        }

        // Sync Position (Root follows Body)
        this.visualRoot.position.copy(this.body.position);
        
        // Offset: 
        // Body Y is Center of Sphere (Radius 1.25).
        // Feet are at BodyY - 1.25.
        // Mesh Pivot is at Feet.
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