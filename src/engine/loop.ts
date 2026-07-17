import { SimulationState } from './types';
import { updateSimulation } from './simulation';

/**
 * Fixed-timestep game loop.
 *
 * `state` - the mutable simulation state object.
 * `onTick` - callback invoked after each simulation update; receives the updated state.
 */
export function startLoop(state: SimulationState, onTick: (newState: SimulationState) => void) {
  const TARGET_TPS = 30; // simulation updates per second
  const TICK_MS = 1000 / TARGET_TPS;
  let lastTime = performance.now();
  let accumulator = 0;
  let rafId: number;

  function tick(now: number) {
    const delta = now - lastTime;
    lastTime = now;
    accumulator += delta;

    // Prevent spiral of death when tab is inactive
    if (accumulator > TICK_MS * 5) accumulator = TICK_MS * 5;

    while (accumulator >= TICK_MS) {
      if (!state.paused) {
        updateSimulation(state);
      }
      accumulator -= TICK_MS;
    }

    onTick(state);
    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);

  // Return a cleanup function for React's effect cleanup
  return () => cancelAnimationFrame(rafId);
}
