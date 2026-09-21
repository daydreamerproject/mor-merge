/* Shared by the page and the headless physics checks; no DOM dependencies. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vendor/matter.min.js'));
  else root.MorPhysics = factory(root.Matter);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Matter) {
  'use strict';
  const { Body, Bodies, Collision, Composite, Detector, Engine, Events, Query, Sleeping, Vertices } = Matter;
  const WIDTH = 480, HEIGHT = 740, LEFT = 24, RIGHT = 456, FLOOR = 704, DROP_Y = 82;
  const TIERS = [
    { name: 'Mint Candy', shape: 'circle', w: 26, h: 26, color: '#a5dabb' },
    { name: 'Muffin', shape: 'cup', w: 36, h: 34, radius: 8, color: '#dfb88a' },
    { name: 'Macaron Blue', shape: 'oval', w: 50, h: 40, color: '#ADD8E6' },
    { name: 'Macaron Pink', shape: 'oval', w: 58, h: 46, color: '#ead7b7' },
    { name: 'Macaron Green', shape: 'oval', w: 68, h: 54, color: '#d4c3e6' },
    { name: 'Popsicle', shape: 'capsule', w: 42, h: 92, color: '#eaa3a1' },
    { name: 'Ice Cream', shape: 'oval', w: 80, h: 72, color: '#c3dba5' },
    { name: 'Cake', shape: 'box', w: 96, h: 70, radius: 10, color: '#eac39c' },
    { name: 'Coffee', shape: 'cup', w: 104, h: 84, radius: 12, color: '#c8ab93' },
    { name: 'Bubble Milk Tea', shape: 'cup', w: 106, h: 136, radius: 14, color: '#d4be9c' },
    { name: 'Doctor', shape: 'oval', w: 146, h: 132, color: '#b4cfdd' }
  ];
  function outline(t) {
    const { w, h, shape } = t;
    if (shape === 'circle' || shape === 'oval') {
      return Array.from({ length: 32 }, (_, i) => {
        const a = i * Math.PI * 2 / 32;
        return { x: Math.cos(a) * w / 2, y: Math.sin(a) * h / 2 };
      });
    }
    if (shape === 'capsule') {
      // Two semicircular caps, with a vertex at each pole (no flat end face).
      const r = w / 2, stem = h / 2 - r, points = [], segments = 24;
      for (let i = 0; i <= segments; i++) {
        const a = Math.PI + i * Math.PI / segments;
        points.push({ x: Math.cos(a) * r, y: -stem + Math.sin(a) * r });
      }
      for (let i = 0; i <= segments; i++) {
        const a = i * Math.PI / segments;
        points.push({ x: Math.cos(a) * r, y: stem + Math.sin(a) * r });
      }
      return points;
    }
    const top = shape === 'pudding' ? .70 : 1;
    const bottom = shape === 'cup' ? .72 : 1;
    return Vertices.chamfer([
      { x: -w * top / 2, y: -h / 2 }, { x: w * top / 2, y: -h / 2 },
      { x: w * bottom / 2, y: h / 2 }, { x: -w * bottom / 2, y: h / 2 }
    ], t.radius, 8);
  }
  function createItem(tier, x, y, angle = 0) {
    if (!Number.isInteger(tier) || !TIERS[tier]) throw new RangeError('Invalid tier');
    const body = Body.create({
      label: TIERS[tier].name, position: { x, y }, vertices: outline(TIERS[tier]),
      restitution: .06, friction: .65, frictionStatic: 1, frictionAir: .018,
      density: .0016, slop: .035, sleepThreshold: 90,
      // Matter's air friction damps both translation and rotation. Give capsules
      // time to tip before sleeping, without applying any ongoing tipping torque.
      ...(TIERS[tier].shape === 'capsule' ? {
        friction: .35, frictionStatic: .6, frictionAir: .008, sleepThreshold: 180
      } : {}),
      plugin: { tier, consumed: false }
    });
    Body.setAngle(body, angle);
    return body;
  }
  function spawnMotion(tier, random = Math.random) {
    if (TIERS[tier].shape !== 'capsule') return { angle: 0, angularVelocity: 0 };
    const direction = random() < .5 ? -1 : 1;
    return {
      angle: direction * (.04 + random() * .06),
      angularVelocity: direction * (.0005 + random() * .001)
    };
  }
  function fitInside(body) {
    // Keep growth inside the jar; the contact point remains the preferred centre.
    let dx = 0, dy = 0;
    if (body.bounds.min.x < LEFT) dx = LEFT - body.bounds.min.x + .5;
    if (body.bounds.max.x > RIGHT) dx = RIGHT - body.bounds.max.x - .5;
    if (body.bounds.max.y > FLOOR) dy = FLOOR - body.bounds.max.y - .5;
    if (dx || dy) Body.translate(body, { x: dx, y: dy });
    return body;
  }
  function createSimulation({ random = Math.random, onMerge = () => {} } = {}) {
    const engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
    engine.gravity.y = 1;
    const walls = [
      Bodies.rectangle(14, 420, 20, 568, { isStatic: true, friction: .7 }),
      Bodies.rectangle(466, 420, 20, 568, { isStatic: true, friction: .7 }),
      Bodies.rectangle(240, 716, 472, 24, { isStatic: true, friction: .8 })
    ];
    Composite.add(engine.world, walls);
    let pending = [], mergeCount = 0;
    const items = () => Composite.allBodies(engine.world).filter(b => !b.isStatic);
    function eligible(a, b) {
      return a !== b && !a.isStatic && !b.isStatic && !a.plugin.consumed && !b.plugin.consumed
        && a.plugin.tier === b.plugin.tier && a.plugin.tier < TIERS.length - 1
        && Detector.canCollide(a.collisionFilter, b.collisionFilter);
    }
    function claimContact(a, b, points) {
      if (!eligible(a, b) || !points.length) return;
      const contact = points.reduce((p, v) => ({ x: p.x + v.x / points.length, y: p.y + v.y / points.length }), { x: 0, y: 0 });
      // Both event contacts and the settled-body check share the same immediate lock.
      a.plugin.consumed = b.plugin.consumed = true;
      pending.push({ a, b, tier: a.plugin.tier + 1, contact });
    }
    // Numerical roundoff only (1e-8 game pixels), not a merge radius.
    const CONTACT_EPSILON = 1e-8;
    function boundaryContact(a, b) {
      // Matter's SAT rejects zero overlap. Check actual polygon boundaries for
      // exact vertex/edge contact, including the ends of collinear shared edges.
      for (const [vertices, edges] of [[a.vertices, b.vertices], [b.vertices, a.vertices]]) {
        for (const v of vertices) {
          for (let i = 0; i < edges.length; i++) {
            const p = edges[i], q = edges[(i + 1) % edges.length];
            const dx = q.x - p.x, dy = q.y - p.y, lengthSquared = dx * dx + dy * dy;
            const t = lengthSquared ? Math.max(0, Math.min(1, ((v.x - p.x) * dx + (v.y - p.y) * dy) / lengthSquared)) : 0;
            const x = p.x + t * dx, y = p.y + t * dy;
            if ((v.x - x) ** 2 + (v.y - y) ** 2 <= CONTACT_EPSILON ** 2) {
              return [{ x: (v.x + x) / 2, y: (v.y + y) / 2 }];
            }
          }
        }
      }
      return [];
    }
    function scanSettledContacts() {
      // Engine collision events omit sleeping/sleeping pairs. Re-query current
      // geometry after solving, without waking bodies or trusting cached pairs.
      const tiers = Array.from({ length: TIERS.length - 1 }, () => []);
      for (const body of items()) if (!body.plugin.consumed && tiers[body.plugin.tier]) tiers[body.plugin.tier].push(body);
      for (const bodies of tiers) {
        bodies.sort((a, b) => a.bounds.min.x - b.bounds.min.x || a.id - b.id);
        for (let i = 0; i < bodies.length; i++) {
          const a = bodies[i];
          for (let j = i + 1; j < bodies.length && !a.plugin.consumed; j++) {
            const b = bodies[j];
            if (b.bounds.min.x > a.bounds.max.x + CONTACT_EPSILON) break;
            if (!eligible(a, b) || a.bounds.max.y + CONTACT_EPSILON < b.bounds.min.y || b.bounds.max.y + CONTACT_EPSILON < a.bounds.min.y) continue;
            const collision = Collision.collides(a, b);
            claimContact(a, b, collision
              ? collision.supports.slice(0, collision.supportCount).filter(Boolean)
              : boundaryContact(a, b));
          }
        }
      }
    }
    function queueMerges(event) {
      // Claim both parents immediately, before another contact in this tick can reuse either.
      for (const pair of event.pairs) {
        if (!pair.isActive) continue;
        const a = pair.bodyA.parent, b = pair.bodyB.parent;
        // Contact bookkeeping for run rules; this does not change collision response.
        if (!a.isStatic && !b.isStatic) a.plugin.hasContact = b.plugin.hasContact = true;
        if (!a.isStatic && b === walls[2]) a.plugin.hasContact = true;
        if (!b.isStatic && a === walls[2]) b.plugin.hasContact = true;
        claimContact(a, b, pair.collision.supports.slice(0, pair.collision.supportCount).filter(Boolean));
      }
    }
    Events.on(engine, 'collisionStart', queueMerges);
    Events.on(engine, 'collisionActive', queueMerges);
    Events.on(engine, 'afterUpdate', () => {
      scanSettledContacts();
      const batch = pending;
      pending = [];
      for (const { a, b, tier, contact } of batch) {
        const angle = Math.atan2(Math.sin(a.angle) + Math.sin(b.angle), Math.cos(a.angle) + Math.cos(b.angle));
        const motion = spawnMotion(tier, random);
        const merged = fitInside(createItem(tier, contact.x, contact.y, angle + motion.angle));
        const mass = a.mass + b.mass;
        const cap = v => Math.max(-5, Math.min(5, v));
        Body.setVelocity(merged, { x: cap((a.velocity.x * a.mass + b.velocity.x * b.mass) / mass), y: cap((a.velocity.y * a.mass + b.velocity.y * b.mass) / mass) });
        Body.setAngularVelocity(merged, Math.max(-.08, Math.min(.08, (a.angularVelocity + b.angularVelocity) / 2 + motion.angularVelocity)));
        Composite.remove(engine.world, [a, b]);
        Composite.add(engine.world, merged);
        mergeCount++;
        merged.plugin.hasContact = true;
        if (onMerge({ tier, body: merged }) === false) {
          // A mode may end on this exact merge. Leave all unprocessed parents intact.
          for (const entry of batch) entry.a.plugin.consumed = entry.b.plugin.consumed = false;
          break;
        }
      }
      // Removing supporting parents must allow sleeping objects above them to fall.
      if (batch.length) items().forEach(b => Sleeping.set(b, false));
    });
    return {
      engine, walls, items,
      get mergeCount() { return mergeCount; },
      add(tier, x, y, angle, angularVelocity = 0) {
        const motion = angle === undefined ? spawnMotion(tier, random) : { angle, angularVelocity };
        const body = createItem(tier, x, y, motion.angle);
        Body.setAngularVelocity(body, motion.angularVelocity);
        Composite.add(engine.world, body);
        return body;
      },
      preview(tier, x, angle = 0) { return fitInside(createItem(tier, x, DROP_Y, angle)); },
      canDrop(body) { return Query.collides(body, Composite.allBodies(engine.world)).length === 0; },
      step(dt = 1000 / 120) { Engine.update(engine, dt); },
      reset() {
        Composite.remove(engine.world, items());
        Engine.clear(engine);
        pending = [];
        mergeCount = 0;
        engine.timing.timestamp = 0;
      }
    };
  }
  return { TIERS, WIDTH, HEIGHT, LEFT, RIGHT, FLOOR, DROP_Y, createItem, spawnMotion, createSimulation };
});
