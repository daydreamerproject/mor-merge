const assert = require('node:assert/strict');
const { Body, Composite, Sleeping } = require('./vendor/matter.min.js');
const P = require('./physics.js'), R = require('./run.js'), ART = require('./art.js');
let checks = 0;
function test(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
const storage = () => { const map = new Map(); return { getItem: k => map.get(k), setItem: (k, v) => map.set(k, v) }; };
function start(mode = 'high-score', store = storage()) {
  const run = R.createRun({ storage: store }); run.start(mode); run.sim.engine.gravity.y = 0; return run;
}
function step(run, ms) { for (let i = 0; i < Math.ceil(ms / (1000 / 120)); i++) run.step(); }
function merge(run, tier, x = 240, y = 500) {
  run.sim.add(tier, x - 3, y); run.sim.add(tier, x + 3, y); run.step();
}
test('exact chain, progressive gameplay area and sprite sizes', () => {
  assert.deepEqual(P.TIERS.map(t => t.name), ['Mint Candy','Muffin','Macaron Blue','Macaron Pink','Macaron Green','Popsicle','Ice Cream','Cake','Coffee','Bubble Milk Tea','Doctor']);
  for (let i = 1; i < 11; i++) {
    assert(P.createItem(i, 0, 0).area > P.createItem(i-1, 0, 0).area, `tier ${i + 1} collider area`);
    assert(ART[i].w * ART[i].h > ART[i-1].w * ART[i-1].h, `tier ${i + 1} art area`);
  }
});
test('every successful transition awards exactly the specified score; drops do not score', () => {
  for (let tier = 0; tier < 10; tier++) {
    const run = start(); run.sim.add(tier, 150, 500); run.step(); assert.equal(run.score, 0);
    run.sim.reset(); merge(run, tier);
    assert.equal(run.sim.items()[0].plugin.tier, tier + 1);
    assert.equal(run.score, (tier + 2) * 10);
  }
});
test('three touching matches score only once', () => {
  const run = start();
  for (const [x,y] of [[220,400],[244,400],[232,420]]) run.sim.add(0,x,y);
  step(run, 100);
  assert.equal(run.score, 20); assert.equal(run.sim.items().length, 2);
});
test('Doctor ×2 ends on precisely the second creation; only the first is later collected', () => {
  const run = start('doctor-two');
  merge(run, 9, 150, 550);
  assert.equal(run.doctorCreatedCount, 1); assert.equal(run.state, 'playing');
  merge(run, 9, 340, 550);
  assert.equal(run.doctorCreatedCount, 2); assert.equal(run.state, 'clear'); assert.equal(run.score, 220);
  assert.equal(run.sim.items().filter(b => b.plugin.tier === 10).length, 2);
  const timestamp = run.sim.engine.timing.timestamp;
  step(run, 2000); assert.equal(run.sim.engine.timing.timestamp, timestamp);
  assert.equal(run.sim.items().filter(b => b.plugin.tier === 10).length, 1);
  assert.equal(run.score, 220); assert.equal(run.doctorCreatedCount, 2);
});
test('simultaneous Doctor pairs stop processing as soon as the second Doctor is created', () => {
  const run = start('doctor-two');
  for (const [x,y] of [[120,300],[340,300],[230,580]]) {
    run.sim.add(9,x-2,y); run.sim.add(9,x+2,y);
  }
  run.step(); assert.equal(run.state, 'clear'); assert.equal(run.score, 220);
  assert.equal(run.doctorCreatedCount, 2);
  assert.equal(run.sim.items().filter(b => b.plugin.tier === 10).length, 2);
  assert.equal(run.sim.items().filter(b => b.plugin.tier === 9).length, 2);
});
test('High Score continues with multiple Doctors; Doctors do not merge further', () => {
  const run = start(); merge(run, 9, 150, 550); merge(run, 9, 340, 550);
  assert.equal(run.state, 'playing'); assert.equal(run.doctorCreatedCount, 2);
  const [a,b] = run.sim.items(); Body.setPosition(a,{x:220,y:550}); Body.setPosition(b,{x:240,y:550});
  step(run, 100); assert.equal(run.score, 220); assert.equal(run.sim.items().length, 2);
  step(run, 2000); assert.equal(run.sim.items().filter(b => b.plugin.tier === 10).length, 2);
});
test('directly selected Doctors neither score nor count toward CLEAR', () => {
  const run = start('doctor-two'); run.sim.add(10,150,500); run.sim.add(10,330,500); step(run,100);
  assert.equal(run.state,'playing'); assert.equal(run.score,0); assert.equal(run.doctorCreatedCount,0);
});
test('both modes lose after continuous overflow; brief crossings reset per-object grace', () => {
  for (const mode of ['doctor-two','high-score']) {
    const run = start(mode), b = run.sim.add(0,240,250);
    run.step(); // establishes that this item entered the jar
    Body.setPosition(b,{x:240,y:160}); Sleeping.set(b,true);
    step(run,1000); assert.equal(run.state,'playing');
    Body.setPosition(b,{x:240,y:250}); run.step(); assert.equal(run.dangerMs,0);
    Body.setPosition(b,{x:240,y:160}); Sleeping.set(b,true);
    step(run,1700); assert.equal(run.state,'playing');
    step(run,120); assert.equal(run.state,'game-over');
    const timestamp=run.sim.engine.timing.timestamp; run.step(); assert.equal(run.sim.engine.timing.timestamp,timestamp);
  }
});
test('fresh uncontacted drops are exempt; objects landing above the line are not', () => {
  const run = start(), b = run.sim.add(0,240,P.DROP_Y);
  step(run,2200); assert.equal(run.state,'playing'); assert.equal(run.dangerMs,0);
  b.plugin.hasContact = true; step(run,1900); assert.equal(run.state,'game-over');
});
test('a removed or merged overflow body cannot leave behind a game-over timer', () => {
  const run = start(), b = run.sim.add(0,240,160); b.plugin.hasContact=true;
  step(run,1200); Composite.remove(run.sim.engine.world,b); step(run,800);
  assert.equal(run.dangerMs,0); assert.equal(run.state,'playing');
});
test('best persists across fresh runs, only High Score saves, and denied storage is safe', () => {
  const store=storage(), run=start('high-score',store); merge(run,2); assert.equal(run.best,40);
  const reopened=R.createRun({storage:store}); assert.equal(reopened.best,40);
  reopened.start('doctor-two'); reopened.sim.engine.gravity.y=0; merge(reopened,9); assert.equal(reopened.best,40);
  run.start('high-score'); assert.equal(run.score,0); assert.equal(run.best,40); assert.equal(run.doctorCreatedCount,0);
  const denied=R.createRun({storage:{getItem(){throw Error('denied');},setItem(){throw Error('denied');}}});
  denied.start('high-score'); denied.sim.engine.gravity.y=0; merge(denied,0);
  assert.equal(denied.score,20); assert.equal(denied.best,20); assert.equal(denied.storageAvailable,false);
  denied.menu(); assert.equal(denied.state,'menu'); assert.equal(denied.sim.items().length,0);
});
test('Doctor ×2 samples the exact weighted 1–6 pool; High Score stays uniform 1–5', () => {
  assert.deepEqual(R.DOCTOR_SPAWN_WEIGHTS, [10,15,20,20,20,15]);
  for (const mode of ['doctor-two','high-score']) {
    const counts = Array(11).fill(0);
    for (let i=0;i<10000;i++) counts[R.pickRandomTier(mode, () => (i + .5) / 10000)]++;
    assert.deepEqual(counts, mode === 'doctor-two' ? [1000,1500,2000,2000,2000,1500,0,0,0,0,0] : [2000,2000,2000,2000,2000,0,0,0,0,0,0]);
  }
  const run = R.createRun({random: () => .9}); run.start('doctor-two'); assert.equal(run.rollTier(),5);
  run.start('high-score'); assert.equal(run.rollTier(),4);
});
test('first Doctor stays for 1.25 seconds, then is collected without changing progress or score', () => {
  const run = start('doctor-two'); merge(run,9,240,550);
  const first = run.sim.items()[0];
  const neighbour = run.sim.add(0,150,550); Sleeping.set(neighbour,true);
  step(run,1200); assert(run.sim.items().includes(first)); assert.equal(run.score,110); assert.equal(run.doctorCreatedCount,1);
  step(run,60); assert(!run.sim.items().includes(first)); assert.equal(run.score,110); assert.equal(run.doctorCreatedCount,1);
  assert.equal(run.state,'playing'); assert.equal(neighbour.isSleeping,false);
  merge(run,9,320,550); assert.equal(run.state,'clear'); assert.equal(run.doctorCreatedCount,2); assert.equal(run.score,220);
  step(run,3000); assert.equal(run.sim.items().filter(b=>b.plugin.tier===10).length,1);
});
test('collection tracks only the merged first Doctor, and restart/menu cancel pending collection', () => {
  const run = start('doctor-two'); const debugDoctor=run.sim.add(10,120,550);
  merge(run,9,340,550); step(run,1400);
  assert(run.sim.items().includes(debugDoctor)); assert.equal(run.doctorCreatedCount,1);
  run.start('doctor-two'); run.sim.engine.gravity.y=0; merge(run,9,240,550);
  run.start('high-score'); run.sim.engine.gravity.y=0; merge(run,9,240,550); step(run,2000);
  assert.equal(run.sim.items().filter(b=>b.plugin.tier===10).length,1);
  run.start('doctor-two'); run.sim.engine.gravity.y=0; merge(run,9); run.menu(); step(run,2000);
  assert.equal(run.sim.items().length,0); assert.equal(run.doctorCreatedCount,0);
});
test('debug metrics track wall time, accepted drops, creation times, endings and resets', () => {
  let clock=100;
  const run=R.createRun({now:()=>clock}); run.start('doctor-two'); run.sim.engine.gravity.y=0;
  run.recordDrop(); run.recordDrop(); clock=30100; merge(run,9,150,550);
  assert.equal(run.totalDrops,2); assert.deepEqual(run.doctorCreatedTimes,[30000]);
  step(run,1400); clock=60100; run.recordDrop(); merge(run,9,340,550);
  assert.equal(run.totalDrops,3); assert.deepEqual(run.doctorCreatedTimes,[30000,60000]); assert.equal(run.elapsedMs,60000);
  clock=90100; step(run,2000); run.recordDrop(); assert.equal(run.totalDrops,3); assert.equal(run.elapsedMs,60000);
  run.start('doctor-two'); assert.equal(run.elapsedMs,0); assert.equal(run.totalDrops,0); assert.deepEqual(run.doctorCreatedTimes,[]);
  run.menu(); clock+=10000; assert.equal(run.elapsedMs,0);
});
test('Doctor sprite replacement keeps its existing display and collider dimensions', () => {
  assert.equal(ART[10].file,'11_doctor_final.png');
  assert.deepEqual([ART[10].w,ART[10].h,ART[10].y],[152,140,-2]);
  assert.deepEqual([P.TIERS[10].w,P.TIERS[10].h,P.TIERS[10].shape],[146,132,'oval']);
});
console.log(`${checks} core-game checks passed.`);
