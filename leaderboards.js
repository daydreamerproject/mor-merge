(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MorLeaderboards = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const NICKNAME_KEY = 'morMergeNickname';
  const KEYS = { 'high-score': 'morMergeHighScoreLeaderboard', 'doctor-two': 'morMergeDoctorLeaderboard' };
  function nickname(value) {
    const name = typeof value === 'string' ? value.trim() : '';
    return name && name.length <= 16 ? name : null;
  }
  function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  function createLeaderboards(storage) {
    const memory = new Map();
    let available = true;
    function read(key) {
      try { const value = storage.getItem(key); memory.set(key, value); return value; }
      catch { available = false; return memory.get(key) ?? null; }
    }
    function write(key, value) {
      memory.set(key, value);
      try { storage.setItem(key, value); return true; }
      catch { available = false; return false; }
    }
    // Failed writes remain usable for this session, rather than reverting to stale disk data.
    const pending = new Set();
    function persist(key, value) { if (!write(key, value)) pending.add(key); else pending.delete(key); }
    function load(key) { return pending.has(key) ? memory.get(key) : read(key); }
    function list(mode) {
      if (!KEYS[mode]) throw new Error('Unknown leaderboard mode');
      let rows;
      try { rows = JSON.parse(load(KEYS[mode]) || '[]'); } catch { rows = []; }
      if (!Array.isArray(rows)) rows = [];
      return rows.filter(row => row && nickname(row.nickname) && Number.isFinite(row.score) && row.score >= 0 &&
        typeof row.date === 'string' && Number.isFinite(Date.parse(row.date)) &&
        (mode !== 'doctor-two' || (Number.isFinite(row.completionMs) && row.completionMs >= 0)))
        .sort((a, b) => mode === 'high-score' ? b.score - a.score : a.completionMs - b.completionMs || b.score - a.score)
        .slice(0, 10);
    }
    const savedRuns = new Map();
    return {
      get available() { return available; },
      getNickname() { return nickname(load(NICKNAME_KEY)) || ''; },
      setNickname(value) {
        const name = nickname(value);
        if (!name) throw new Error('Enter a nickname (1–16 characters).');
        persist(NICKNAME_KEY, name); return name;
      },
      list,
      save({ id, mode, state, nickname: name, score, elapsedMs, date = new Date().toISOString() }) {
        if (!((mode === 'high-score' && state === 'game-over') || (mode === 'doctor-two' && state === 'clear'))) return false;
        if (savedRuns.has(id)) return savedRuns.get(id);
        name = nickname(name);
        if (!id || !name || !Number.isFinite(score) || score < 0 || !Number.isFinite(Date.parse(date)) ||
          (mode === 'doctor-two' && (!Number.isFinite(elapsedMs) || elapsedMs < 0))) throw new Error('Invalid run result');
        const row = { id, nickname: name, score, date };
        if (mode === 'doctor-two') row.completionMs = elapsedMs;
        const rows = list(mode);
        if (rows.some(old => old.id === id)) { savedRuns.set(id, true); return true; }
        rows.push(row);
        rows.sort((a, b) => mode === 'high-score' ? b.score - a.score : a.completionMs - b.completionMs || b.score - a.score);
        const top = rows.slice(0, 10), qualified = top.includes(row);
        if (qualified) persist(KEYS[mode], JSON.stringify(top));
        savedRuns.set(id, qualified);
        return qualified;
      },
      clear() {
        // Only ranking data: keep the nickname and the existing personal best.
        for (const key of Object.values(KEYS)) persist(key, '[]');
      }
    };
  }
  return { createLeaderboards, nickname, formatTime, NICKNAME_KEY, KEYS };
});
