/**
 * SCENARIO PRESETS REPOSITORY
 *
 * Deterministic scenario presets for experimental evaluation and interactive UI demos.
 * Each scenario provides:
 *   - deterministic seed
 *   - fire origin rooms
 *   - fire start time & growth parameters
 *   - blocked exits / environmental failures
 *   - occupant configuration
 *   - description & demonstration objective
 */

export const SCENARIO_PRESETS = Object.freeze({
  NORMAL: {
    id: 'NORMAL',
    name: '1. Normal Baseline Operation',
    seed: 42,
    fireRooms: [],
    fireStartSeconds: 9999,
    fireSeverity: 'LOW',
    spreadRateMultiplier: 1.0,
    blockedExits: {},
    occupantsCount: 50,
    description: 'Normal building operation without fire outbreaks. Verifies zero false positive reroutes.',
  },

  GRADUAL_FIRE: {
    id: 'GRADUAL_FIRE',
    name: '2. Gradual Smoldering Fire',
    seed: 43,
    fireRooms: ['ROOM_101'],
    fireStartSeconds: 5.0,
    fireSeverity: 'LOW',
    spreadRateMultiplier: 0.6,
    blockedExits: {},
    occupantsCount: 50,
    description: 'Slow-developing smoldering fire. Tests early warning progression: SAFE → WATCH → PREDICTED_WARNING.',
  },

  RAPID_FIRE: {
    id: 'RAPID_FIRE',
    name: '3. Rapid Flashover Fire',
    seed: 44,
    fireRooms: ['ROOM_101'],
    fireStartSeconds: 5.0,
    fireSeverity: 'HIGH',
    spreadRateMultiplier: 2.5,
    blockedExits: {},
    occupantsCount: 50,
    description: 'Fast t^2 flashover escalation in Room 101. Measures predictive lead-time before critical untenable threshold.',
  },

  ADJACENT_PROPAGATION: {
    id: 'ADJACENT_PROPAGATION',
    name: '4. Adjacent Space Convection',
    seed: 45,
    fireRooms: ['ROOM_101'],
    fireStartSeconds: 4.0,
    fireSeverity: 'MEDIUM',
    spreadRateMultiplier: 1.5,
    blockedExits: {},
    occupantsCount: 50,
    description: 'Fire in Room 101 convective smoke plume propagating into Corridor Main. Tests proactive corridor avoidance.',
  },

  MULTI_ROOM_FIRE: {
    id: 'MULTI_ROOM_FIRE',
    name: '5. Multi-Origin Outbreak',
    seed: 46,
    fireRooms: ['ROOM_101', 'STAFF_ROOM'],
    fireStartSeconds: 4.0,
    fireSeverity: 'MEDIUM',
    spreadRateMultiplier: 1.4,
    blockedExits: {},
    occupantsCount: 50,
    description: 'Concurrent dual-origin fire threatening East and Central egress corridors simultaneously.',
  },

  BLOCKED_PRIMARY_EXIT: {
    id: 'BLOCKED_PRIMARY_EXIT',
    name: '6. Blocked Primary Egress',
    seed: 47,
    fireRooms: ['ROOM_101'],
    fireStartSeconds: 4.0,
    fireSeverity: 'MEDIUM',
    spreadRateMultiplier: 1.2,
    blockedExits: { EXIT_EAST: true },
    occupantsCount: 50,
    description: 'Primary East Exit is physically obstructed. Tests deterministic Dijkstra fallback to Secondary North/Stair exits.',
  },

  SENSOR_NOISE: {
    id: 'SENSOR_NOISE',
    name: '7. High Sensor Noise Perturbation',
    seed: 48,
    fireRooms: ['ROOM_101'],
    fireStartSeconds: 5.0,
    fireSeverity: 'MEDIUM',
    spreadRateMultiplier: 1.2,
    sensorNoisePct: 8,
    blockedExits: {},
    occupantsCount: 50,
    description: 'Stochastic Gaussian sensor noise injected across all telemetry streams. Verifies route stability hysteresis.',
  },

  SENSOR_FAILURE: {
    id: 'SENSOR_FAILURE',
    name: '8. Sensor Failure & Dropped Packets',
    seed: 49,
    fireRooms: ['ROOM_101'],
    fireStartSeconds: 5.0,
    fireSeverity: 'MEDIUM',
    spreadRateMultiplier: 1.2,
    failureSimulation: { enabled: true, targetSensor: 'TEMP_101', failureType: 'FROZEN' },
    blockedExits: {},
    occupantsCount: 50,
    description: 'Primary temperature sensor in Room 101 freezes at baseline. Verifies cross-sensor FAS & smoke fusion.',
  },

  PREDICTIVE_REROUTE: {
    id: 'PREDICTIVE_REROUTE',
    name: '9. Proactive Egress Demonstration',
    seed: 50,
    fireRooms: ['ROOM_101'],
    fireStartSeconds: 4.0,
    fireSeverity: 'MEDIUM',
    spreadRateMultiplier: 1.8,
    blockedExits: {},
    occupantsCount: 50,
    description: 'Flagship demonstration scenario: ML predicts corridor danger at t=10s, rerouting occupants 12s before flashover.',
  },
});
