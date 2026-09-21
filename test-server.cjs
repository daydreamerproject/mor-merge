const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const server = require('./dev-server.cjs');

function request(port, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject); req.end();
  });
}
(async () => {
  // Ephemeral test port avoids interfering with another user's dev server.
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    for (const [url, file, mime] of [
      ['/assets/logo/logo_ZMTV.png', 'assets/logo/logo_ZMTV.png', 'image/png'],
      ['/', 'index.html', 'text/html'], ['/index.html', 'index.html', 'text/html'],
      ['/style.css', 'style.css', 'text/css'], ['/game.js', 'game.js', 'text/javascript'],
      ['/leaderboards.js', 'leaderboards.js', 'text/javascript'],
      ['/physics.js', 'physics.js', 'text/javascript'], ['/run.js', 'run.js', 'text/javascript'], ['/art.js', 'art.js', 'text/javascript'],
      ...require('./art.js').map(a => [`/assets/${a.file}`, `assets/${a.file}`, 'image/png']),
      ['/vendor/matter.min.js', 'vendor/matter.min.js', 'text/javascript']
    ]) {
      const result = await request(port, url);
      assert.equal(result.status, 200);
      assert(result.headers['content-type'].startsWith(mime));
      assert.equal(result.headers['cache-control'], 'no-store');
      assert.deepEqual(result.body, await fs.readFile(file));
    }
    const head = await request(port, '/', 'HEAD');
    assert.equal(head.status, 200); assert.equal(head.body.length, 0);
    assert(Number(head.headers['content-length']) > 0);
    for (const url of ['/.git/config', '/../package.json', '/%2e%2e%2fpackage.json', '/dev-server.cjs', '/missing']) {
      assert.equal((await request(port, url)).status, 404);
    }
    assert.equal((await request(port, '/%ZZ')).status, 400);
    assert.equal((await request(port, '/', 'POST')).status, 405);
    assert.equal((await request(port, '/game.js?refresh=1')).status, 200);
    console.log('PASS server assets, MIME types, HEAD, no-cache, missing/private paths, malformed URLs, and method handling');
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
