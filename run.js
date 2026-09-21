(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./physics.js'));
  else root.MorRun = factory(root.MorPhysics);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (P) {
  'use strict';
  const LINE_Y = 180, GRACE_MS = 1800, BEST_KEY = 'mor-merge.best.v1';
  const VICTORY_DELAY_MS = 2000;
  const DOCTOR_SPAWN_WEIGHTS = Object.freeze([10, 15, 20, 20, 20, 15]);
  function pickRandomTier(mode, random = Math.random) {
    if (mode !== 'doctor-two') return Math.floor(random() * 5); // Original High Score pool.
    const sample = random() * 100;
    let cumulative = 0;
    for (let tier = 0; tier < DOCTOR_SPAWN_WEIGHTS.length; tier++) {
      cumulative += DOCTOR_SPAWN_WEIGHTS[tier];
      if (sample < cumulative) return tier;
    }
    return 5;
  }
  function createRun({ storage, random = Math.random, now = () => performance.now() } = {}) {
    let mode = null, state = 'menu', score = 0, doctors = 0, best = 0, storageAvailable = true;
    let dangerMs = 0;
    let victoryStartedAt = null, startedAt = null, endedElapsed = null, totalDrops = 0;
    let doctorCreatedTimes = [];
    const elapsedMs = () => startedAt === null ? 0 : endedElapsed ?? Math.max(0, now() - startedAt);
    function resetMetrics() {
      victoryStartedAt = null; startedAt = null; endedElapsed = null;
      totalDrops = 0; doctorCreatedTimes = [];
    }
    const overflow = new Map();
    try {
      const value = Number(storage?.getItem(BEST_KEY));
      if (Number.isSafeInteger(value) && value >= 0) best = value;
    } catch { storageAvailable = false; }
    function saveBest() {
      if (mode !== 'high-score' || score <= best) return;
      best = score;
      try { storage?.setItem(BEST_KEY, String(best)); } catch { storageAvailable = false; }
    }
    const sim = P.createSimulation({ random, onMerge({ tier }) {
      if (state !== 'playing') return false;
      score += (tier + 1) * 10;
      if (tier === 10) {
        doctors++;
        if (doctors <= 2) doctorCreatedTimes.push(elapsedMs());
      }
      saveBest();
      if (mode === 'doctor-two' && doctors === 2) {
        endedElapsed = doctorCreatedTimes[1];
        victoryStartedAt = now();
        state = 'victory';
        return false;
      }
    } });
    return {
      sim,
      get state() { return state; }, get mode() { return mode; },
      get score() { return score; }, get doctorCreatedCount() { return doctors; },
      get best() { return best; }, get storageAvailable() { return storageAvailable; },
      get dangerMs() { return dangerMs; },
      get elapsedMs() { return elapsedMs(); }, get totalDrops() { return totalDrops; },
      get doctorCreatedTimes() { return [...doctorCreatedTimes]; },
      rollTier() { return pickRandomTier(mode, random); },
      recordDrop() { if (state === 'playing') totalDrops++; },
      start(nextMode) {
        if (!['doctor-two', 'high-score'].includes(nextMode)) throw new RangeError('Unknown mode');
        sim.reset(); mode = nextMode; state = 'playing'; score = 0; doctors = 0;
        dangerMs = 0; overflow.clear();
        resetMetrics(); startedAt = now();
      },
      menu() { sim.reset(); state = 'menu'; score = 0; doctors = 0; dangerMs = 0; overflow.clear(); resetMetrics(); },
      step(dt = 1000 / 120) {
        // Freeze the completed board; presentation time never contributes to run time.
        if (state === 'victory') {
          if (now() - victoryStartedAt >= VICTORY_DELAY_MS) state = 'clear';
          return;
        }
        if (state !== 'playing') return;
        sim.step(dt);
        if (state !== 'playing') return; // CLEAR takes effect on the second Doctor creation.
        const alive = new Set();
        dangerMs = 0;
        for (const body of sim.items()) {
          alive.add(body.id);
          if (body.bounds.min.y >= LINE_Y) body.plugin.enteredJar = true;
          if (body.bounds.min.y < LINE_Y && (body.plugin.enteredJar || body.plugin.hasContact)) {
            const elapsed = (overflow.get(body.id) || 0) + dt;
            overflow.set(body.id, elapsed);
            dangerMs = Math.max(dangerMs, elapsed);
          } else overflow.delete(body.id);
        }
        for (const id of overflow.keys()) if (!alive.has(id)) overflow.delete(id);
        if (dangerMs + .001 >= GRACE_MS) { endedElapsed = elapsedMs(); state = 'game-over'; }
      }
    };
  }
  return { createRun, pickRandomTier, DOCTOR_SPAWN_WEIGHTS, VICTORY_DELAY_MS, LINE_Y, GRACE_MS, BEST_KEY };
});
