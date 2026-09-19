/**
 * CircuitBreaker — three-state model for sync source availability.
 *
 * States (stored in waze-health.json):
 *   CLOSED    — normal operation
 *   OPEN      — source blocked; all sync jobs suspended
 *   HALF_OPEN — cooldown expired; one test run allowed to confirm recovery
 *
 * Transitions are driven by WazeGuard (not directly by this module).
 * This module only reads state and provides helpers.
 */

export const CircuitBreaker = {
  /** Read circuit state from the health object. */
  getState(health) {
    return health.circuitState || 'CLOSED';
  },

  /** True when no new sync should start. */
  isOpen(health) {
    return CircuitBreaker.getState(health) === 'OPEN';
  },

  /** True when one test run is allowed to probe recovery. */
  isHalfOpen(health) {
    return CircuitBreaker.getState(health) === 'HALF_OPEN';
  },
};
