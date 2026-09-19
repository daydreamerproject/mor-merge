const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const HOST = '0.0.0.0';
const PORT = 3000;
// Only publish the page's assets, never .git, local configuration, or other workspace files.
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/game.js', ['game.js', 'text/javascript; charset=utf-8']],
  ['/physics.js', ['physics.js', 'text/javascript; charset=utf-8']],
  ['/run.js', ['run.js', 'text/javascript; charset=utf-8']],
  ['/art.js', ['art.js', 'text/javascript; charset=utf-8']],
  ['/vendor/matter.min.js', ['vendor/matter.min.js', 'text/javascript; charset=utf-8']]
]);
for (const { file } of require('./art.js')) assets.set(`/assets/${file}`, [`assets/${file}`, 'image/png']);

const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end('Method not allowed');
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); res.end('Bad request'); return; }
  const asset = assets.get(pathname);
  if (!asset) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const content = await fs.readFile(path.join(__dirname, asset[0]));
    res.writeHead(200, { 'Content-Type': asset[1], 'Content-Length': content.length });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    console.error(`Could not serve ${asset[0]}: ${error.message}`);
    res.writeHead(500); res.end('Could not read the requested asset');
  }
});

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? 'Port 3000 is already in use. Stop the other server, then run npm run dev again.'
    : `Could not start MOR MERGE: ${error.message}`);
  process.exitCode = 1;
});
if (require.main === module) server.listen(PORT, HOST, () => {
  console.log('\nMOR MERGE — local development server');
  console.log(`Local: http://localhost:${PORT}`);
  const addresses = new Map();
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) addresses.set(entry.address, name);
    }
  }
  for (const [address, name] of addresses) console.log(`Network: http://${address}:${PORT} (${name})`);
  if (!addresses.size) console.log('Network: no LAN IPv4 address found. Connect the PC to Wi-Fi and restart.');
  console.log('\nOn your phone, join the same Wi-Fi and open the Network URL for your Wi-Fi/Ethernet adapter.');
  console.log('Keep this terminal open. Press Ctrl+C to stop.');
  console.log('If blocked, allow Node.js through Windows Firewall for Private networks; check guest Wi-Fi isolation.\n');
});

module.exports = server;
