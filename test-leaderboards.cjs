const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('./leaderboards.js');
function fixture() {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  return { data, storage, boards: L.createLeaderboards(storage) };
}
const result = (id, score, extra = {}) => ({ id, nickname: 'Player', mode: 'high-score', state: 'game-over', score, date: '2026-09-20T12:00:00.000Z', ...extra });
test('nickname required, trimmed, bounded, editable and reloadable', () => {
  const { boards, storage } = fixture();
  for (const name of ['', '   ', '12345678901234567']) assert.throws(() => boards.setNickname(name));
  assert.equal(boards.setNickname('  Mint  '), 'Mint');
  assert.equal(L.createLeaderboards(storage).getNickname(), 'Mint');
  boards.setNickname('1234567890123456');
  assert.equal(L.createLeaderboards(storage).getNickname(), '1234567890123456');
});
test('High Score descending Top 10, duplicate names, persisted dates, once per run', () => {
  const { boards, storage } = fixture();
  for (let i = 0; i < 15; i++) assert.equal(boards.save(result(`run-${i}`, i * 10)), true);
  assert.equal(boards.save(result('low', 0)), false);
  boards.save(result('run-14', 140));
  const rows = L.createLeaderboards(storage).list('high-score');
  assert.deepEqual(rows.map(row => row.score), [140,130,120,110,100,90,80,70,60,50]);
  assert(rows.every(row => row.nickname === 'Player' && row.date === '2026-09-20T12:00:00.000Z'));
  assert.equal(boards.list('doctor-two').length, 0);
});
test('Doctor only accepts clears; fastest then higher score; independent Top 10', () => {
  const { boards, storage } = fixture();
  assert.equal(boards.save(result('failed', 99999, { mode: 'doctor-two', elapsedMs: 1 })), false);
  for (let i = 0; i < 15; i++) boards.save(result(`doctor-${i}`, i, { mode: 'doctor-two', state: 'clear', elapsedMs: 10000 - i * 100 }));
  boards.save(result('tie', 999, { mode: 'doctor-two', state: 'clear', elapsedMs: 8600 }));
  const rows = L.createLeaderboards(storage).list('doctor-two');
  assert.equal(rows.length, 10);
  assert.equal(rows[0].id, 'tie'); assert.equal(rows[1].id, 'doctor-14');
  assert(rows.every((row, i) => !i || rows[i-1].completionMs <= row.completionMs));
  assert.equal(boards.list('high-score').length, 0);
  assert.equal(L.formatTime(522999), '08:42');
});
test('non-ending states never save; clear only ranking keys', () => {
  const { boards, data } = fixture();
  boards.setNickname('Keep'); data.set('mor-merge.best.v1', '777');
  assert.equal(boards.save(result('playing', 50, { state: 'playing' })), false);
  boards.save(result('score', 50));
  boards.save(result('doctor', 50, { mode: 'doctor-two', state: 'clear', elapsedMs: 8000 }));
  boards.clear();
  assert.equal(boards.list('high-score').length, 0); assert.equal(boards.list('doctor-two').length, 0);
  assert.equal(boards.getNickname(), 'Keep'); assert.equal(data.get('mor-merge.best.v1'), '777');
});
test('corrupt storage safely ignored and unavailable writes retain session data', () => {
  const { boards, storage, data } = fixture();
  data.set(L.KEYS['high-score'], '{invalid'); assert.deepEqual(boards.list('high-score'), []);
  data.set(L.KEYS['doctor-two'], '[null,{}, {"nickname":"bad","score":-1}]'); assert.deepEqual(boards.list('doctor-two'), []);
  storage.setItem = () => { throw Error('Quota'); };
  boards.setNickname('Session'); boards.save(result('session', 80));
  assert.equal(boards.getNickname(), 'Session'); assert.equal(boards.list('high-score')[0].score, 80);
  assert.equal(boards.available, false);
  boards.clear(); assert.deepEqual(boards.list('high-score'), []);
  const denied = L.createLeaderboards({ getItem() { throw Error('Denied'); }, setItem() { throw Error('Denied'); } });
  denied.setNickname('Offline'); assert.equal(denied.getNickname(), 'Offline');
});
