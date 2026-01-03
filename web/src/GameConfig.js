export const GameConfig = {
  // --- DEBUG ---
  // Default should be false for production. Enabled for development.
  debug: {
    showPhysics: false, // Cannon Debugger Wireframes
    showStats: false, // Player Physics Tuning GUI
    showFPS: false, // Performance Stats (FPS)
  },

  // --- WORLD ---
  world: {
    gravity: { x: 0, y: -30, z: 0 },
    timeStep: 1 / 60,
  },

  // --- GAMEPLAY ---
  game: {
    playerCount: 8,
    // Red, Green, Yellow, Purple, Cyan
    palette: [0xff5555, 0x50fa7b, 0xf1fa8c, 0xbd93f9, 0x8be9fd],
  },

  // --- PLAYER PHYSICS DEFAULTS ---
  // Use these values to tune the feel without touching Player.js
  player: {
    mass: 80,
    moveForce: 4000, // Frictionless movement force (Low inertia)
    damping: 0.95, // 0.98 = Slippery (Ice), 0.90 = Mud
    maxSpeed: 60, // Hard Limit
    bargeForce: 5000,
    bargeCooldown: 4.0,
    bargeDuration: 0.3,
  },
};
