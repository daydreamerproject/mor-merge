(() => {
  'use strict';
  // Layout only: keep the 480 × 740 canvas/physics coordinates unchanged.
  // visualViewport follows mobile browser chrome; dvh is the CSS fallback.
  const playfield = document.querySelector('.playfield');
  function sizeJar() {
    const width = Math.max(0, Math.min(playfield.clientWidth - 2, (playfield.clientHeight - 2) * 480 / 740));
    playfield.style.setProperty('--jar-width', `${width}px`);
    playfield.style.setProperty('--jar-height', `${width * 740 / 480}px`);
  }
  function sizeViewport() {
    document.documentElement.style.setProperty('--visible-height', `${window.visualViewport?.height ?? window.innerHeight}px`);
    sizeJar();
  }
  new ResizeObserver(sizeJar).observe(playfield);
  window.addEventListener('resize', sizeViewport);
  window.visualViewport?.addEventListener('resize', sizeViewport);
  sizeViewport();
  const status = document.querySelector('#status');
  if (!window.Matter || !window.MorPhysics || !window.MorRun || !window.MorArt || !window.MorLeaderboards) {
    status.textContent = 'Matter.js could not load. Check that vendor/matter.min.js is present.';
    document.querySelector('#asset-status').textContent = 'Game files could not load. Refresh after starting npm run dev.';
    return;
  }
  const P = window.MorPhysics, R = window.MorRun, art = window.MorArt;
  let storage;
  try { storage = window.localStorage; } catch { storage = { getItem() { throw new Error('Storage unavailable'); } }; }
  const run = R.createRun({ storage }), sim = run.sim;
  const boards = window.MorLeaderboards.createLeaderboards(storage);
  const nicknameInput = document.querySelector('#nickname');
  nicknameInput.value = boards.getNickname();
  let runNickname = '', runId = '', boardOrigin = 'menu', boardMode = 'high-score';
  const boardScreen = document.querySelector('#leaderboard-screen');
  const main = document.querySelector('main'), modeScreen = document.querySelector('#mode-screen');
  const result = document.querySelector('#result'), sprites = [];
  let shownEnding = null;
  const canvas = document.querySelector('#game'), ctx = canvas.getContext('2d');
  const select = document.querySelector('#tier-select'), debug = document.querySelector('#debug');
  let aim = P.WIDTH / 2, current, next, lastDrop = -Infinity, pointer = null, ghost, motion;
  const roll = () => select.value === 'random' ? run.rollTier() : Number(select.value);
  P.TIERS.forEach((t, tier) => {
    const option = new Option(`${tier + 1}. ${t.name}`, String(tier));
    select.add(option);
    const li = document.createElement('li');
    li.textContent = `${t.name} · ${t.shape}`;
    document.querySelector('#tiers').append(li);
  });
  function trace(context, vertices) {
    context.beginPath();
    vertices.forEach((v, i) => i ? context.lineTo(v.x, v.y) : context.moveTo(v.x, v.y));
    context.closePath();
  }
  function drawItem(context, body, alpha = 1) {
    const tier = body.plugin.tier, a = art[tier], sprite = sprites[tier];
    if (!sprite?.complete || !sprite.naturalWidth) return;
    context.save();
    context.globalAlpha = alpha;
    context.translate(body.position.x, body.position.y);
    context.rotate(body.angle);
    context.translate(a.x || 0, a.y || 0);
    context.rotate(a.angle || 0);
    context.drawImage(sprite, ...a.crop, -a.w / 2, -a.h / 2, a.w, a.h);
    context.restore();
  }
  function smallPreview(id, tier) {
    const c = document.querySelector(id), context = c.getContext('2d'), a = art[tier];
    context.clearRect(0, 0, c.width, c.height);
    context.save();
    context.translate(c.width / 2, c.height / 2);
    const angle = a.angle || 0;
    const w = Math.abs(Math.cos(angle)) * a.w + Math.abs(Math.sin(angle)) * a.h + 2 * Math.abs(a.x || 0);
    const h = Math.abs(Math.sin(angle)) * a.w + Math.abs(Math.cos(angle)) * a.h + 2 * Math.abs(a.y || 0);
    const scale = Math.min(1, 95 / w, 76 / h);
    context.scale(scale, scale);
    drawItem(context, P.createItem(tier, 0, 0));
    context.restore();
  }
  function refreshGhost() { ghost = sim.preview(current, aim, motion.angle); }
  function refreshQueue() {
    // Sample once per queued item, so moving the aim does not reroll its tilt.
    motion = P.spawnMotion(current);
    document.querySelector('#current-name').textContent = P.TIERS[current].name;
    document.querySelector('#next-name').textContent = P.TIERS[next].name;
    smallPreview('#current-preview', current);
    smallPreview('#next-preview', next);
    refreshGhost();
  }
  function queue() { current = roll(); next = roll(); refreshQueue(); }
  function drop() {
    if (run.state !== 'playing' || sim.engine.timing.timestamp - lastDrop < 450 || !sim.canDrop(ghost)) return;
    sim.add(current, ghost.position.x, ghost.position.y, ghost.angle, motion.angularVelocity);
    run.recordDrop();
    lastDrop = sim.engine.timing.timestamp;
    current = next;
    next = roll();
    refreshQueue();
  }
  function setAim(event) {
    const rect = canvas.getBoundingClientRect();
    aim = Math.max(P.LEFT, Math.min(P.RIGHT, (event.clientX - rect.left) * P.WIDTH / rect.width));
    refreshGhost();
  }
  canvas.addEventListener('pointerdown', event => {
    event.preventDefault();
    if (run.state !== 'playing' || !event.isPrimary || event.button !== 0 || pointer !== null) return;
    pointer = event.pointerId;
    canvas.setPointerCapture(pointer);
    canvas.focus({ preventScroll: true });
    setAim(event);
  });
  canvas.addEventListener('pointermove', event => {
    if (run.state === 'playing' && event.isPrimary && (event.pointerType === 'mouse' || event.pointerId === pointer)) setAim(event);
  });
  canvas.addEventListener('pointerup', event => {
    if (event.pointerId !== pointer) return;
    setAim(event);
    pointer = null;
    canvas.releasePointerCapture(event.pointerId);
    drop();
  });
  canvas.addEventListener('pointercancel', () => { pointer = null; });
  canvas.addEventListener('lostpointercapture', () => { pointer = null; });
  // Scope gesture suppression to the playfield: prevent touch scrolling, pinch,
  // double-tap zoom and long-press menus while leaving the rest of the page usable.
  for (const type of ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange', 'gestureend']) {
    canvas.addEventListener(type, event => event.preventDefault(), { passive: false });
  }
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('keydown', event => {
    if (run.state !== 'playing') return;
    if (['ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      aim = Math.max(P.LEFT, Math.min(P.RIGHT, aim + (event.key === 'ArrowLeft' ? -12 : 12)));
      refreshGhost();
    }
    if (event.key === ' ' && !event.repeat) drop();
  });
  select.addEventListener('change', () => { if (run.state === 'playing') queue(); });
  function start(mode) {
    const name = window.MorLeaderboards.nickname(nicknameInput.value);
    if (!name) {
      document.querySelector('#nickname-error').textContent = 'Enter a nickname (1–16 characters).';
      nicknameInput.setAttribute('aria-invalid', 'true');
      nicknameInput.focus(); return;
    }
    runNickname = boards.setNickname(name); nicknameInput.value = name;
    runId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    document.querySelector('#nickname-error').textContent = '';
    nicknameInput.removeAttribute('aria-invalid');
    boardScreen.hidden = true; main.inert = false;
    run.start(mode); shownEnding = null;
    if (result.open) result.close();
    modeScreen.hidden = true; main.hidden = false;
    pointer = null; lastDrop = -Infinity; aim = P.WIDTH / 2; accumulator = 0;
    document.querySelector('.debug-panel').open = false;
    document.querySelector('#mode-label').textContent = mode === 'doctor-two' ? 'Doctor ×2' : 'High Score';
    select.options[0].textContent = mode === 'doctor-two' ? 'Random · weighted tiers 1–6' : 'Random · tiers 1–5';
    queue(); sizeViewport(); canvas.focus({ preventScroll: true });
  }
  function menu() {
    run.menu(); pointer = null; shownEnding = null;
    if (result.open) result.close();
    main.hidden = true; modeScreen.hidden = false;
    boardScreen.hidden = true; main.inert = false;
    document.querySelector('#menu-best').textContent = `Best: ${run.best}`;
    modeScreen.querySelector('button').focus({ preventScroll: true });
  }
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    select.value = 'random'; start(button.dataset.mode);
  }));
  document.querySelector('#reset').addEventListener('click', () => start(run.mode));
  document.querySelector('#retry').addEventListener('click', () => start(run.mode));
  document.querySelector('#modes').addEventListener('click', menu);
  document.querySelector('#back').addEventListener('click', menu);
  result.addEventListener('cancel', event => { event.preventDefault(); menu(); });
  nicknameInput.addEventListener('input', () => {
    document.querySelector('#nickname-error').textContent = '';
    nicknameInput.removeAttribute('aria-invalid');
  });
  function showBoard(mode) {
    boardMode = mode;
    const rows = boards.list(mode), list = document.querySelector('#leaderboard-rows');
    list.replaceChildren();
    for (const row of rows) {
      const li = document.createElement('li'), line = document.createElement('div');
      const name = document.createElement('strong'), value = document.createElement('span'), detail = document.createElement('small');
      name.textContent = row.nickname;
      value.textContent = mode === 'high-score' ? row.score : window.MorLeaderboards.formatTime(row.completionMs);
      detail.textContent = `${mode === 'doctor-two' ? `Score: ${row.score} · ` : ''}${new Date(row.date).toLocaleString()}`;
      line.append(name, value); li.append(line, detail); list.append(li);
    }
    document.querySelector('#leaderboard-empty').hidden = rows.length > 0;
    document.querySelector('#leaderboard-storage').textContent = boards.available ? '' : 'Storage unavailable. New results are kept for this session only.';
    document.querySelectorAll('[data-board]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.board === mode)));
  }
  function openBoard(origin) {
    boardOrigin = origin;
    if (result.open) result.close();
    modeScreen.hidden = true; boardScreen.hidden = false; main.inert = true;
    showBoard(origin === 'result' ? run.mode : boardMode);
    document.querySelector(`[data-board="${boardMode}"]`).focus({ preventScroll: true });
  }
  document.querySelector('#menu-leaderboard').addEventListener('click', () => openBoard('menu'));
  document.querySelector('#result-leaderboard').addEventListener('click', () => openBoard('result'));
  document.querySelectorAll('[data-board]').forEach(button => button.addEventListener('click', () => showBoard(button.dataset.board)));
  document.querySelector('#leaderboard-back').addEventListener('click', () => {
    boardScreen.hidden = true; main.inert = false;
    if (boardOrigin === 'result') result.showModal();
    else { modeScreen.hidden = false; document.querySelector('#menu-leaderboard').focus(); }
  });
  const clearConfirmation = document.querySelector('#clear-confirmation');
  document.querySelector('#clear-leaderboards').addEventListener('click', () => clearConfirmation.showModal());
  document.querySelector('#cancel-clear').addEventListener('click', () => clearConfirmation.close());
  document.querySelector('#confirm-clear').addEventListener('click', () => {
    boards.clear();
    clearConfirmation.close();
    document.querySelector('#clear-status').textContent = boards.available ? 'Local leaderboards cleared.' : 'Cleared for this session; browser storage is unavailable.';
  });
  function formatTime(ms) {
    if (ms === undefined) return '—';
    const tenths = Math.floor(ms / 100);
    return `${Math.floor(tenths / 600)}:${(tenths % 600 / 10).toFixed(1).padStart(4, '0')}`;
  }
  function updateRunUI() {
    // Lock all gameplay controls while the completed board is on display.
    main.inert = run.state === 'victory' || !boardScreen.hidden;
    if (run.state === 'victory') pointer = null;
    const times = run.doctorCreatedTimes;
    const stats = document.querySelector('#run-stats');
    const text = `Elapsed (wall clock): ${formatTime(run.elapsedMs)} · Drops: ${run.totalDrops} · Doctor #1: ${formatTime(times[0])} · Doctor #2: ${formatTime(times[1])}`;
    if (stats.textContent !== text) stats.textContent = text;
    document.querySelector('#score').textContent = run.score;
    document.querySelector('#progress').textContent = run.mode === 'doctor-two' ? `Doctor ${run.doctorCreatedCount} / 2` : `Best ${run.best}`;
    if (!['clear', 'game-over'].includes(run.state) || shownEnding === run.state) return;
    shownEnding = run.state; pointer = null;
    const qualified = boards.save({ id: runId, nickname: runNickname, mode: run.mode, state: run.state, score: run.score, elapsedMs: run.elapsedMs });
    result.dataset.ending = run.state;
    document.querySelector('#result-title').textContent = run.state === 'clear' ? 'CLEAR!' : 'GAME OVER';
    document.querySelector('#result-message').textContent = run.state === 'clear' ? 'Doctor ×2 Complete' : 'The pile stayed above the line.';
    document.querySelector('#result-score').textContent = `Score: ${run.score}`;
    document.querySelector('#result-best').textContent = run.mode === 'high-score' ? `Best: ${run.best}${run.storageAvailable ? '' : ' (this session; storage unavailable)'}` : '';
    document.querySelector('#result-time').textContent = run.state === 'clear' ? `Time: ${window.MorLeaderboards.formatTime(run.elapsedMs)}` : '';
    document.querySelector('#result-ranking').textContent = (qualified ? (run.mode === 'high-score' ? 'NEW LEADERBOARD SCORE!' : 'NEW BEST TIME!') : '') +
      (!boards.available ? ' Storage unavailable; results are kept for this session only.' : '');
    document.querySelector('#retry').textContent = run.state === 'clear' ? 'Play Again' : 'Retry';
    result.showModal();
  }
  function render() {
    if (run.state === 'menu') return;
    ctx.clearRect(0, 0, P.WIDTH, P.HEIGHT);
    for (const wall of sim.walls) {
      trace(ctx, wall.vertices); ctx.fillStyle = '#778899'; ctx.fill();
    }
    const ready = sim.engine.timing.timestamp - lastDrop >= 450;
    const clear = sim.canDrop(ghost);
    ctx.save();
    ctx.setLineDash([4, 6]); ctx.strokeStyle = clear ? '#c4cdc4' : '#c46060';
    ctx.beginPath(); ctx.moveTo(ghost.position.x, ghost.bounds.max.y + 6);
    ctx.lineTo(ghost.position.x, P.FLOOR); ctx.stroke(); ctx.restore();
    if (run.state === 'playing') drawItem(ctx, ghost, clear && ready ? .7 : .2);
    const items = sim.items();
    items.forEach(body => drawItem(ctx, body));
    ctx.save();
    ctx.strokeStyle = run.dangerMs ? '#b73838' : '#cf6860'; ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = run.dangerMs ? 3 : 1.5; ctx.setLineDash([7, 5]);
    ctx.beginPath(); ctx.moveTo(P.LEFT, R.LINE_Y); ctx.lineTo(P.RIGHT, R.LINE_Y); ctx.stroke();
    ctx.font = '12px system-ui'; ctx.textAlign = 'left';
    ctx.fillText('GAME OVER LINE', P.LEFT + 6, R.LINE_Y - 8);
    ctx.restore();
    if (debug.checked) {
      for (const body of [...sim.walls, ...items]) {
        trace(ctx, body.vertices); ctx.strokeStyle = body.isSleeping ? '#2871ed' : '#ce2265'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle;
        body.vertices.forEach(v => ctx.fillRect(v.x - 1.5, v.y - 1.5, 3, 3));
        ctx.beginPath(); ctx.moveTo(body.position.x - 4, body.position.y); ctx.lineTo(body.position.x + 4, body.position.y);
        ctx.moveTo(body.position.x, body.position.y - 4); ctx.lineTo(body.position.x, body.position.y + 4); ctx.stroke();
      }
    }
    const message = run.dangerMs ? `Danger — ${((R.GRACE_MS - run.dangerMs) / 1000).toFixed(1)}s` : !clear ? 'Aim elsewhere — drop area blocked.' : ready ? 'Drag to aim · Release to drop' : 'Settling…';
    const text = `${message}${debug.checked ? ' · Pink: awake / blue: asleep' : ''}`;
    if (status.textContent !== text) status.textContent = text;
    updateRunUI();
  }
  // A fixed 120 Hz step makes thin/rotating objects reliable across display refresh rates.
  const STEP = 1000 / 120;
  let previous = performance.now(), accumulator = 0;
  function frame(now) {
    accumulator += Math.min(now - previous, 100);
    previous = now;
    while (accumulator >= STEP) { run.step(STEP); accumulator -= STEP; }
    render(); requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { previous = performance.now(); accumulator = 0; });
  document.querySelector('#menu-best').textContent = `Best: ${run.best}`;
  Promise.all(art.map((a, tier) => new Promise((resolve, reject) => {
    const sprite = new Image(); sprites[tier] = sprite;
    sprite.onload = resolve;
    sprite.onerror = () => reject(new Error(`Could not load assets/${a.file}`));
    sprite.src = `assets/${a.file}`;
  }))).then(() => {
    document.querySelector('#asset-status').textContent = '11 temporary sprites loaded';
    document.querySelectorAll('[data-mode]').forEach(button => { button.disabled = false; });
  }).catch(error => { document.querySelector('#asset-status').textContent = error.message; });
  requestAnimationFrame(frame);
})();
