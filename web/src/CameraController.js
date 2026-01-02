import * as THREE from 'three';

export class CameraController {
    constructor(camera, target) {
        this.camera = camera;
        this.target = target;
        
        // Configuration
        this.offset = new THREE.Vector3(8, 10, 8); // Close Isometric view
        this.lookAheadFactor = 0.0; // Disabled to prevent disorientation
        this.smoothFactor = 0.2; // Stiffer follow (less lag)
        
        // Initial setup
        this.update(0, true); // Force instant snap on first frame
    }

    update(dt, forceSnap = false) {
        if (!this.target || !this.target.visualRoot) return;

        // 1. Base Target Position
        // We use the mesh position for visual smoothness
        const targetPos = this.target.visualRoot.position.clone();

        // 2. Look Ahead (Based on Physics Velocity)
        // This shifts the camera target in the direction the player is going
        const velocity = this.target.body.velocity;
        const lookAhead = new THREE.Vector3(velocity.x, 0, velocity.z).multiplyScalar(this.lookAheadFactor);
        
        // 3. Calculate Desired Camera Position
        const desiredPosition = targetPos.clone().add(this.offset).add(lookAhead);

        // 4. Move Camera
        if (forceSnap) {
            this.camera.position.copy(desiredPosition);
        } else {
            this.camera.position.lerp(desiredPosition, this.smoothFactor);
        }

        // 5. Look At Target
        // We look securely at the player (minus lookAhead for stability, or with it?)
        // Usually looking at the raw player position feels more "grounded"
        this.camera.lookAt(targetPos);
    }
}
