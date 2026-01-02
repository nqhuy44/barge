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
            mass: 80,           // HEAVY (Restored from 60 to 80)
            moveForce: 5000,    // POWERFUL Engine to push heavy mass
            damping: 0.3,       // Tuned to 0.3 (Slightly more control than 0.25)
            maxSpeed: 20,       // Cap speed
            bargeForce: 12000,  // Strong impact
            bargeCooldown: 1.0
        };
        
        // Input State
        this.input = {
            // Deprecated boolean flags for movement, now using inputStack
            barge: false
        };
        this.inputStack = []; // Last-Key Priority Stack

        // Animation State
        this.bargeTimer = 0; // Cooldown
        this.bargeWindow = 0; // Duration where max speed is ignored
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
        
        // CRITICAL FIX: Shift geometry pivot to FEET
        // Total Height 2.5. Half Height 1.25.
        // We ensure (0,0,0) is at the bottom of the mesh.
        geometry.translate(0, 1.25, 0);

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
        
        // Prevent browser scrolling with arrow keys
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
            event.preventDefault();
        }

        if (event.code === 'Space') {
            this.input.barge = isPressed;
            return;
        }

        const moveKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        if (moveKeys.includes(event.code)) {
            if (isPressed) {
                // Add to stack if not present
                if (!this.inputStack.includes(event.code)) {
                    this.inputStack.push(event.code);
                }
                // If it IS present (repeat keydown), do we move it to top? 
                // Creating "re-press" effect? Usually browser handles repetition.
                // Let's ensure it's at the top for clarity if users mash.
                else {
                    const idx = this.inputStack.indexOf(event.code);
                    this.inputStack.splice(idx, 1);
                    this.inputStack.push(event.code);
                }
            } else {
                // Remove from stack
                const idx = this.inputStack.indexOf(event.code);
                if (idx > -1) {
                    this.inputStack.splice(idx, 1);
                }
            }
        }
    }

    update(dt) {
        // console.log("Player Input Stack:", this.inputStack); 
        // Find latest keys
        const lastX = this.inputStack.slice().reverse().find(k => k === 'ArrowLeft' || k === 'ArrowRight');
        const lastZ = this.inputStack.slice().reverse().find(k => k === 'ArrowUp' || k === 'ArrowDown');
        
        const inputVector = new CANNON.Vec3(0, 0, 0);

        if (lastX === 'ArrowLeft') inputVector.x -= 1;
        if (lastX === 'ArrowRight') inputVector.x += 1;
        if (lastZ === 'ArrowUp') inputVector.z -= 1;
        if (lastZ === 'ArrowDown') inputVector.z += 1;

        // Rotate Input to align with Isometric Camera (45 degrees)
        // Camera is at (+X, +Z) looking at Origin.
        // "Up" key should move away from camera (-X, -Z).
        
        const angle = -Math.PI / 4; // -45 degrees
        
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        
        // Standard Isometric Rotation
        const finalX = inputVector.x * cos - inputVector.z * sin; // Rotate
        const finalZ = inputVector.x * sin + inputVector.z * cos;
        
        // Reuse inputVector
        inputVector.set(finalX, 0, finalZ);

        // Normalize? 
        // Removing normalization makes diagonal movement faster (1.4x force), 
        // which often feels better and avoids "weakness" in diagonal friction calculations.
        // if (inputVector.lengthSquared() > 0) {
        //    inputVector.normalize();
        // }

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
        
        // Ensure awake every frame to prevent sleeping issues
        this.body.wakeUp();

        if (isMoving) {
            const force = new CANNON.Vec3(
                inputVector.x * this.stats.moveForce,
                0,
                inputVector.z * this.stats.moveForce
            );
            this.body.applyForce(force, this.body.position);
        }

        // --- BARGE MECHANIC ---
        if (this.bargeTimer > 0) this.bargeTimer -= dt;
        if (this.bargeWindow > 0) this.bargeWindow -= dt;

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
            this.bargeWindow = 0.5; // Ignore max speed for 0.5s
            
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
        
        // Disable Speed Cap while Barging (to allow burst)
        if (this.bargeWindow <= 0 && speed > this.stats.maxSpeed) {
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
        // FIX: Disable scaling for now to ensure visuals match physics (Radius 0.75)
        const baseScale = 1.0; 
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
        // Physics Body Center (Sphere r=0.75) is at Y=0.75 relative to floor.
        // Mesh Pivot is now at FEET (0,0,0).
        // Feet should be at BodyY - 0.75.
        this.mesh.position.y -= 0.75; 

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
        this.mesh.position.y -= 0.75;
        this.mesh.quaternion.copy(this.body.quaternion);
    }
}
