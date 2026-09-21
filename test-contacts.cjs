const assert = require('node:assert/strict');
const { Body, Collision, Events, Sleeping } = require('./vendor/matter.min.js');
const P = require('./physics.js');
let cases = 0;
function advance(sim, count) { for (let i = 0; i < count; i++) sim.step(); }
function expected(tier) { return tier === 10 ? 0 : 1; }
function contactDistance(tier, direction = 'x') {
  // Use polygon support planes, not nominal width/height: chamfered edges can
  // be slightly sloped, so two touching AABBs alone are not a valid fixture.
  const body = P.createItem(tier, 0, 0);
  let distance = Infinity;
  for (const axis of body.axes) {
    const along = Math.abs(axis[direction]);
    if (along < 1e-12) continue;
    const dots = body.vertices.map(v => v.x * axis.x + v.y * axis.y);
    distance = Math.min(distance, (Math.max(...dots) - Math.min(...dots)) / along);
  }
  return distance;
}
function check(name, fn) {
  for (let tier = 0; tier < 11; tier++) {
    try { fn(tier); cases++; }
    catch (error) { console.error(`FAIL ${name}: ${P.TIERS[tier].name}`); throw error; }
  }
  console.log(`PASS ${name} (all 11 tiers)`);
}
function pair(tier, gap = 0, angle = 0) {
  const sim = P.createSimulation(); sim.engine.gravity.y = 0;
  const a = sim.add(tier, 150, 350, angle);
  const width = contactDistance(tier);
  const b = sim.add(tier, 150 + Math.cos(angle) * (width + gap), 350 + Math.sin(angle) * (width + gap), angle);
  return { sim, a, b };
}
check('drop directly onto a matching settled object', tier => {
  const sim = P.createSimulation();
  const a = sim.add(tier, 240, 400, 0); advance(sim, 1440);
  sim.add(tier, a.position.x, a.bounds.min.y - P.TIERS[tier].h / 2 - 40, 0);
  advance(sim, 720);
  assert.equal(sim.mergeCount, expected(tier));
  assert.equal(sim.items().length, tier === 10 ? 2 : 1);
});
check('slow translation and rotation into contact', tier => {
  const { sim, a, b } = pair(tier, .3);
  Body.setVelocity(a, { x: .08, y: 0 });
  Body.setAngularVelocity(a, .0005); Body.setAngularVelocity(b, -.0005);
  advance(sim, 600);
  assert.equal(sim.mergeCount, expected(tier));
});
check('matching objects already at rest recover contact without another impact', tier => {
  const sim = P.createSimulation(); sim.engine.gravity.y = 0;
  const a = sim.add(tier, 150, 400, 0), b = sim.add(tier, 330, 400, 0);
  advance(sim, 600);
  assert(a.isSleeping && b.isSleeping);
  Body.setPosition(b, { x: a.position.x + contactDistance(tier) - .02, y: a.position.y });
  assert(Collision.collides(a, b));
  sim.step();
  assert.equal(sim.mergeCount, expected(tier));
});
check('both sleeping with positive collider overlap; no collision event needed', tier => {
  const { sim, a, b } = pair(tier, -.02);
  assert(Collision.collides(a, b));
  Sleeping.set(a, true); Sleeping.set(b, true);
  let starts = 0; Events.on(sim.engine, 'collisionStart', () => starts++);
  sim.step(); assert.equal(starts, 0);
  assert.equal(sim.mergeCount, expected(tier));
});
check('exact polygon boundary contact, awake and asleep, including rotation', tier => {
  for (const angle of [0, .23, .79, 1.4]) {
    for (const asleep of [false, true]) {
      const { sim, a, b } = pair(tier, 0, angle);
      Sleeping.set(a, asleep); Sleeping.set(b, asleep);
      sim.step();
      assert.equal(sim.mergeCount, expected(tier), `angle ${angle}, asleep ${asleep}`);
      if (tier < 10) {
        const merged = sim.items()[0];
        const midpoint = { x: (a.position.x + b.position.x) / 2, y: (a.position.y + b.position.y) / 2 };
        assert(Math.hypot(merged.position.x - midpoint.x, merged.position.y - midpoint.y) < P.TIERS[tier].h / 2 + 2);
      }
    }
  }
});
check('three simultaneous contacts claim each parent at most once', tier => {
  for (const asleep of [false, true]) {
    let notifications = 0;
    const sim = P.createSimulation({ onMerge() { notifications++; } }); sim.engine.gravity.y = 0;
    const height = contactDistance(tier, 'y');
    const parents = [0,1,2].map(i => sim.add(tier, 240, 260 + i * (height - .02), 0));
    parents.forEach(b => Sleeping.set(b, asleep));
    sim.step(); advance(sim, 30);
    assert.equal(sim.mergeCount, expected(tier)); assert.equal(notifications, expected(tier));
    assert.equal(sim.items().length, tier === 10 ? 3 : 2);
    assert(sim.items().every(b => !b.plugin.consumed), 'surviving body must not retain a merge lock');
  }
});
check('real gaps never merge, including microscopic gaps and overlapping AABBs', tier => {
  for (const gap of [.00001, .25, 1, 3]) {
    for (const angle of [0, .79]) {
      const { sim, a, b } = pair(tier, gap, angle);
      assert.equal(Collision.collides(a, b), null);
      Sleeping.set(a, true); Sleeping.set(b, true);
      advance(sim, 240);
      assert.equal(sim.mergeCount, 0);
      assert(a.isSleeping && b.isSleeping, 'contact scan must not wake separated objects');
    }
  }
});
{
  // At these offsets, the green sprite's decorative edge overlaps, but its
  // unchanged oval polygons do not. Artwork overlap must NOT become a merge.
  for (const [dx, dy] of [[50,38],[55,33],[60,26],[64,19]]) {
    const sim = P.createSimulation(); sim.engine.gravity.y = 0;
    const a = sim.add(4,150,350,0), b = sim.add(4,150+dx,350+dy,0);
    assert.equal(Collision.collides(a,b),null);
    Sleeping.set(a,true); Sleeping.set(b,true); advance(sim,240);
    assert.equal(sim.mergeCount,0); cases++;
  }
  console.log('PASS artwork-only overlap remains non-merging');
}
{
  const { sim, a, b } = pair(4,-.02);
  a.collisionFilter.mask = 0;
  Sleeping.set(a,true); Sleeping.set(b,true); advance(sim,10);
  assert.equal(sim.mergeCount,0); cases++;
  console.log('PASS collision filters are respected by the settled-contact scan');
}
{
  const { sim, a, b } = pair(4,-.02);
  Sleeping.set(a,true); Sleeping.set(b,true); sim.reset(); advance(sim,10);
  assert.equal(sim.mergeCount,0); assert.equal(sim.items().length,0); cases++;
  console.log('PASS reset leaves no queued or stale contact');
}
console.log(`${cases} contact scenario/tier checks passed (including rotated, awake/asleep and gap variants).`);
