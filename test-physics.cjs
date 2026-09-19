const assert = require('node:assert/strict');
const { Body, Composite, Query } = require('./vendor/matter.min.js');
const P = require('./physics.js');
let checks = 0;
function test(name, run) { run(); checks++; console.log(`PASS ${name}`); }
function advance(sim, seconds) { for (let i = 0; i < seconds * 120; i++) sim.step(); }

test('all 11 shapes fall, remain within the jar, and settle', () => {
  for (let tier = 0; tier < P.TIERS.length; tier++) {
    const sim = P.createSimulation();
    const b = sim.add(tier, 240, 160, .23);
    advance(sim, .3);
    assert(b.position.y > 170, `${b.label} should fall`);
    advance(sim, 12);
    assert(b.bounds.max.y < P.FLOOR + 1, `${b.label} penetrated floor`);
    assert(b.bounds.max.y > P.FLOOR - 2, `${b.label} did not reach floor`);
    assert(b.isSleeping || b.speed < .05, `${b.label} should settle`);
  }
});
test('separated identical items do not merge', () => {
  const sim = P.createSimulation();
  sim.engine.gravity.y = 0;
  sim.add(0, 200, 300); sim.add(0, 228, 300);
  advance(sim, 1);
  assert.equal(sim.mergeCount, 0);
  assert.equal(sim.items().length, 2);
});
test('capsule corners do not use an oversized circle collider', () => {
  const capsule = P.createItem(5, 240, 300);
  const candy = P.createItem(0, 275, 300);
  assert.equal(Query.collides(candy, [capsule]).length, 0);
  assert(capsule.bounds.max.x - capsule.bounds.min.x <= 43);
  assert(capsule.bounds.max.y - capsule.bounds.min.y >= 91);
});
test('same-tier contact merges once at the contact midpoint', () => {
  const sim = P.createSimulation(); sim.engine.gravity.y = 0;
  const a = sim.add(0, 220, 300), b = sim.add(0, 245, 300);
  sim.step();
  assert.equal(sim.mergeCount, 1);
  assert.equal(sim.items().length, 1);
  const result = sim.items()[0];
  assert.equal(result.plugin.tier, 1);
  assert(Math.abs(result.position.x - 232.5) < 3);
  assert(Math.abs(result.position.y - 300) < 5);
  assert(!sim.items().includes(a) && !sim.items().includes(b));
});
test('three simultaneous matching contacts never reuse a parent', () => {
  const sim = P.createSimulation(); sim.engine.gravity.y = 0;
  sim.add(0, 220, 300); sim.add(0, 244, 300); sim.add(0, 232, 320);
  advance(sim, .5);
  assert.equal(sim.mergeCount, 1);
  assert.deepEqual(sim.items().map(b => b.plugin.tier).sort(), [0, 1]);
});
test('four matching objects merge in disjoint pairs and can chain later', () => {
  const sim = P.createSimulation(); sim.engine.gravity.y = 0;
  for (const x of [200, 224, 248, 272]) sim.add(0, x, 300);
  sim.step();
  assert.equal(sim.mergeCount, 2);
  assert.deepEqual(sim.items().map(b => b.plugin.tier), [1, 1]);
  const [a, b] = sim.items();
  Body.setPosition(a, { x: 220, y: 300 }); Body.setPosition(b, { x: 240, y: 300 });
  sim.step();
  assert.equal(sim.mergeCount, 3);
  assert.equal(sim.items()[0].plugin.tier, 2);
});
test('all ten merge transitions work; final-tier objects remain separate', () => {
  for (let tier = 0; tier < 11; tier++) {
    const sim = P.createSimulation(); sim.engine.gravity.y = 0;
    sim.add(tier, 220, 300); sim.add(tier, 225, 300);
    sim.step();
    assert.equal(sim.mergeCount, tier === 10 ? 0 : 1);
    assert.equal(sim.items().length, tier === 10 ? 2 : 1);
    assert.equal(sim.items()[0].plugin.tier, Math.min(tier + 1, 10));
  }
});
test('non-round bodies rotate on impact and different tiers stack', () => {
  const sim = P.createSimulation();
  const cake = sim.add(7, 240, 650, .4);
  advance(sim, 5);
  assert(Math.abs(cake.angle - .4) > .15, 'impact should rotate cake');
  const cup = sim.add(8, 240, 180, .05);
  advance(sim, 12);
  assert.equal(sim.mergeCount, 0);
  assert(cup.position.y < cake.position.y - 50);
  assert(cup.isSleeping || cup.speed < .05);
});
test('spawn blocking, wall-safe growth, and reset', () => {
  const sim = P.createSimulation();
  const ghost = sim.preview(10, -500);
  assert(ghost.bounds.min.x >= P.LEFT);
  assert(sim.canDrop(ghost));
  sim.add(10, ghost.position.x, ghost.position.y);
  assert(!sim.canDrop(ghost));
  sim.reset();
  sim.engine.gravity.y = 0;
  sim.add(0, P.LEFT + 13, 300); sim.add(0, P.LEFT + 13, 324);
  sim.step();
  assert.equal(sim.mergeCount, 1);
  assert(sim.items()[0].bounds.min.x >= P.LEFT);
  sim.reset();
  assert.equal(sim.items().length, 0);
  assert.equal(sim.mergeCount, 0);
  assert.equal(Composite.allBodies(sim.engine.world).length, 3);
  advance(sim, 1);
  assert.equal(sim.items().length, 0);
});
test('capsules tip naturally from small spawn perturbations in both directions', () => {
  let tipped = 0, left = 0, right = 0;
  for (let seed = 1; seed <= 40; seed++) {
    let state = Math.imul(seed, 2654435761) >>> 0;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const sim = P.createSimulation({ random });
    const body = sim.add(5, 240, P.DROP_Y);
    assert(Math.abs(body.angle) >= .04 && Math.abs(body.angle) <= .10);
    assert(Math.abs(body.angularVelocity) >= .0005 && Math.abs(body.angularVelocity) <= .0015);
    if (body.angle < 0) left++; else right++;
    advance(sim, 12);
    if (Math.abs(Math.sin(body.angle)) > .8) tipped++;
    assert(body.isSleeping || body.speed < .05, 'capsule must eventually settle');
    assert(body.bounds.max.y <= P.FLOOR + 1, 'capsule must not tunnel through floor');
  }
  assert(left > 0 && right > 0, 'spawn motion must work in both directions');
  assert(tipped >= 36, `expected most drops to tip, got ${tipped}/40`);
});
test('capsule has round end caps and only capsules receive new spawn motion/settings', () => {
  const capsule = P.createItem(5, 0, 0);
  const ends = capsule.vertices.filter(v => Math.abs(v.y) > 25);
  for (const v of ends) {
    const capY = Math.sign(v.y) * 25;
    assert(Math.abs(Math.hypot(v.x, v.y - capY) - 21) < .001);
  }
  assert.equal(capsule.vertices.filter(v => Math.abs(v.y - 46) < .001).length, 1);
  const sim = P.createSimulation();
  for (let tier = 0; tier < 11; tier++) {
    if (tier === 5) continue;
    const b = sim.add(tier, 240, 200);
    assert.equal(b.angle, 0); assert.equal(b.angularVelocity, 0);
    assert.equal(b.friction, .65); assert.equal(b.frictionStatic, 1);
    assert.equal(b.frictionAir, .018); assert.equal(b.sleepThreshold, 90);
    assert.equal(b.restitution, .06);
  }
});
test('merge into a capsule receives a small perturbation and tilted previews fit at edges', () => {
  const sim = P.createSimulation({ random: () => .75 }); sim.engine.gravity.y = 0;
  sim.add(4, 220, 300); sim.add(4, 225, 300);
  sim.step();
  const capsule = sim.items()[0];
  assert.equal(capsule.plugin.tier, 5);
  assert(capsule.angle > .04 && capsule.angle < .10);
  assert(capsule.angularVelocity > .0005 && capsule.angularVelocity < .0015);
  for (const angle of [-.1, .1]) {
    for (const x of [P.LEFT, P.RIGHT]) {
      const preview = sim.preview(5, x, angle);
      assert(preview.bounds.min.x >= P.LEFT && preview.bounds.max.x <= P.RIGHT);
    }
  }
});
console.log(`${checks} physics checks passed.`);
