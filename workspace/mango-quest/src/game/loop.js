// Mango Quest — fixed-timestep game loop (decoupled update/render).
import { TICK_MS } from "./constants.js";

// createLoop({ update, render })
// update(dt) is called with a fixed dt (ms) via an accumulator based on TICK_MS.
// render() is called once per animation frame.
// Returns { start(), stop() }.
export function createLoop({ update, render }) {
  let rafId = null;
  let last = 0;
  let acc = 0;
  let running = false;

  function frame(now) {
    if (!running) return;
    if (!last) last = now;
    let delta = now - last;
    last = now;
    // Clamp big deltas (tab switch) to avoid the spiral of death.
    if (delta > 250) delta = 250;
    acc += delta;
    while (acc >= TICK_MS) {
      update(TICK_MS);
      acc -= TICK_MS;
    }
    render();
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    last = 0;
    acc = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  return { start, stop };
}