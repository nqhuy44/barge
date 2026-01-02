import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Player {
    constructor(scene, world, position = { x: 0, y: 5, z: 0 }, color = 0xffff00, material = null, inputEnabled = true) {
        this.scene = scene;
        this.world = world;
        this.color = color;
        this.color = color;
        this.material = material;
        this.inputEnabled = inputEnabled;
        
        // Physics Constants (Tweaked for "Heavy & Drift")
        // Physics Stats (Configurable)
        this.stats = {
            mass: 100,          // Heavy Base
            moveForce: 5000,    // Increased to overcome Heavy Mass
            damping: 0.5,       // Reduced from 0.7 to allow movement
            maxSpeed: 15,
            bargeForce: 15000,   // Dash power
            bargeCooldown: 1.0
        };
        
        // Input State
        
        // Input State
        this.input = {
            up: false,
            down: false,
            left: false,
            right: false,
            barge: false
        };

        // Animation State
        this.bargeTimer = 0;
        this.animTime = 0;
        this.squashScale = new THREE.Vector3(1, 1, 1);

        this.initPhysics(position);
        this.initVisuals();
        this.setupInput();
    }

    initPhysics(pos) {
        const radius = 0.75; // 0.75 = Chunky
        const shape = new CANNON.Sphere(radius);
        
        this.body = new CANNON.Body({
            mass: this.stats.mass,
            shape: shape,
            linearDamping: this.stats.damping,
            position: new CANNON.Vec3(pos.x, pos.y, pos.z),
            material: this.material,
        });
        
        // Lock rotation to prevent tumbling
        this.body.fixedRotation = true;
        this.body.updateMassProperties();
        this.body.allowSleep = false; // Prevent sleeping

        this.world.addBody(this.body);
    }

    initVisuals() {
        // The Bean: Chunky Capsule
        const geometry = new THREE.CapsuleGeometry(0.75, 1, 4, 8); // Radius 0.75, Height 1 (Total 2.5)
        // Vibrant Pink, Shiny Plastic
        const material = new THREE.MeshStandardMaterial({ 
            color: 0xff0055, 
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
        switch(event.code) {
            case 'ArrowUp': this.input.up = isPressed; break;
            case 'ArrowDown': this.input.down = isPressed; break;
            case 'ArrowLeft': this.input.left = isPressed; break;
            case 'ArrowRight': this.input.right = isPressed; break;
            case 'Space': this.input.barge = isPressed; break;
        }
    }

    update(dt) {
        // console.log("Player Update. Input:", this.input); // Too noisy every frame, stick to key events + velocity set check
        // 1. Calculate Input Vector (Direction)
        const inputVector = new CANNON.Vec3(0, 0, 0);

        if (this.input.up) inputVector.z -= 1;
        if (this.input.down) inputVector.z += 1;
        if (this.input.left) inputVector.x -= 1;
        if (this.input.right) inputVector.x += 1;

        // Normalize if moving diagonally so speed is consistent
        if (inputVector.lengthSquared() > 0) {
            inputVector.normalize();
        }

        // 2. Rotate Body to Face Movement Direction
        if (inputVector.lengthSquared() > 0) {
            const angle = Math.atan2(inputVector.x, inputVector.z);
            const targetQuat = new CANNON.Quaternion();
            targetQuat.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), angle);
            
            // Smoothly interpolate rotation (slerp)
            this.body.quaternion.slerp(targetQuat, 0.1, this.body.quaternion);
        }

        // 3. Force Application (Heavy Feel)
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

        // --- BARGE MECHANIC ---
        if (this.bargeTimer > 0) this.bargeTimer -= dt;

        if (this.input.barge && this.bargeTimer <= 0) {
            // Determine direction (Face forward if no input)
            let bargeDir = inputVector.clone();
            if (bargeDir.lengthSquared() === 0) {
                // Use current rotation if no input
                const forward = new CANNON.Vec3(0, 0, 1);
                this.body.quaternion.vmult(forward, bargeDir);
            }
            bargeDir.normalize();

            // Apply Impulse
            const impulse = bargeDir.scale(this.stats.bargeForce);
            this.body.applyImpulse(impulse, this.body.position);
            
            // Trigger Cooldown & Animation
            this.bargeTimer = this.stats.bargeCooldown;
            
            // Squash Animation (Flatten Y, Expand XZ)
            this.squashScale.set(1.4, 0.6, 1.4);
        }

        // 4. Limit Max Speed (Safety Cap)
        // Note: Barge can momentarily exceed max speed, which is fun.
        // We only clamp if we are NOT barging? Or just clamp gently?
        // Let's hard clamp for now, but maybe increase limit?
        // Actually, for a barge, we want to exceed the limit.
        // Simple hack: If moving normally, clamp. 
        // But user asked to Cap Max Speed. Let's strictly cap it, or the barge feels weak if capped instantly.
        // Let's allow overspeed for friction to kill it.
        const vel = this.body.velocity;
        const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
        if (speed > this.stats.maxSpeed) {
            // Only clamp if not recently barged? Or just let friction handle it?
            // "The player slides too much" -> Friction is 0.9. It will kill speed fast.
            // So we can relax the clamp or just clamp to a higher value?
            // Let's strictly clamp for consistency as requested before.
            const ratio = this.stats.maxSpeed / speed;
            vel.x *= ratio;
            vel.z *= ratio;
        } 
        
        // 5. Procedural Animation & Visual Sync
        this.animTime += dt;
        
        // Base Scale from Mass (100 = 1.0)
        const baseScale = this.stats.mass / 100;
        const targetScale = new THREE.Vector3(baseScale, baseScale, baseScale);

        // Recovery from Squash to Target Scale
        this.squashScale.lerp(targetScale, 0.1);
        
        // Idle Breathing (Y-axis scale)
        const breathe = 1 + Math.sin(this.animTime * 3) * 0.03;
        
        // Apply Scales
        this.mesh.scale.copy(this.squashScale);
        if (!isMoving) {
             this.mesh.scale.y *= breathe;
        }

        // Sync Position & Rotation
        this.mesh.position.copy(this.body.position);
        
        // Offset Calculation:
        // Physics Body Center (Sphere r=0.75) is at Y=0.75.
        // Visual Mesh (Capsule r=0.75, h=1, total=2.5) has center at Y=1.25.
        // Diff = 1.25 - 0.75 = 0.5.
        // We need to move Visual UP by 0.5 relative to Physics.
        this.mesh.position.y += 0.5; 

        this.mesh.quaternion.copy(this.body.quaternion);
    }

    // --- Stats API ---

    /**
     * Updates mass and scales visual size.
     * DOES NOT affect Force (allows "Tank" builds).
     */
    setMass(newMass) {
        this.stats.mass = newMass;
        this.body.mass = newMass;
        this.body.updateMassProperties();
        
        // Visual Scale: Base 100 = 1.0
        // We update the base scale target for procedural animation
        // We'll update stats.mass, which is read by update() for baseScale
    }

    setMoveForce(force) {
        this.stats.moveForce = force;
    }

    setBargeForce(force) {
        this.stats.bargeForce = force;
    }

    setDamping(damping) {
        this.stats.damping = damping;
    }

    setMaxSpeed(speed) {
        this.stats.maxSpeed = speed;
    }

    /**
     * Resets player position and zeroes out momentum.
     * @param {Object} pos - Target position {x, y, z}
     */
    reset(pos) {
        this.body.position.set(pos.x, pos.y, pos.z);
        this.body.velocity.set(0, 0, 0);
        this.body.angularVelocity.set(0, 0, 0);
        this.body.quaternion.set(0, 0, 0, 1);
        
        // Snap Visuals immediately
        this.mesh.position.copy(this.body.position);
        this.mesh.position.y += 0.5;
        this.mesh.quaternion.copy(this.body.quaternion);
    }
}
