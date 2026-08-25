#!/usr/bin/env node
// Static file server for local development. The page must be served over HTTP: it loads an ES
// module, an AudioWorklet module and a .wasm file, and a file:// URL blocks all three.
//
//   node scripts/serve.mjs              -> repo root on :8000
//   node scripts/serve.mjs docs 8001    -> the published copy on :8001
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(REPO, process.argv[2] || '.');
const PORT = Number(process.argv[3] || 8000);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mid': 'audio/midi',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.scad': 'text/plain; charset=utf-8',
  '.stl': 'model/stl',
  '.md': 'text/markdown; charset=utf-8'
};

createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let target = path.resolve(ROOT, '.' + pathname);
  // A resolved path outside the served root is refused rather than read.
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, () => console.log(`serving ${ROOT} at http://localhost:${PORT}`));
