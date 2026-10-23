#!/usr/bin/env node
// Re-encodes reference_pages PNGs in the `notes-pages` bucket to WebP (q85).
//
//   node --env-file=.env.local scripts/import/reencode-reference-pages.mjs            # dry run
//   node --env-file=.env.local scripts/import/reencode-reference-pages.mjs --apply    # upload
//
// Dry run downloads + encodes in memory and reports savings; it writes nothing.
// --apply uploads `<path>.webp` NEXT TO each `<path>.png` and verifies it. It never
// deletes or overwrites the PNG and never touches the database — repoint
// reference_pages.image_url afterwards with the guarded UPDATE in
// supabase/migrations/037_reference_pages_webp.sql (rollback = reverse the replace).
//
// Flags: --apply  --verify (check every existing .webp: decodes + dims match the PNG)  --limit N  --concurrency N (default 2)  --log FILE
import { appendFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (use --env-file).');
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const APPLY = flag('--apply');
const VERIFY = flag('--verify');
const LIMIT = Number(opt('--limit', 0)) || Infinity;
const CONCURRENCY = Number(opt('--concurrency', 2));
const LOG = opt('--log', 'reencode-reference-pages.log.jsonl');
const BUCKET = 'notes-pages';
const QUALITY = 85;
const auth = { Authorization: `Bearer ${KEY}`, apikey: KEY };
const objUrl = (p) => `${URL_}/storage/v1/object/${BUCKET}/${p.split('/').map(encodeURIComponent).join('/')}`;

// Storage returns 429 "too_many_connections" under load; back off and retry.
async function fetchRetry(url, init, tries = 6) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, init);
      if (![429, 500, 502, 503, 504].includes(res.status) || i >= tries - 1) return res;
    } catch (e) {
      if (i >= tries - 1) throw e;
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** i + Math.random() * 500));
  }
}

async function listPngPaths() {
  const paths = new Set();
  for (let from = 0; ; from += 1000) {
    const res = await fetchRetry(`${URL_}/rest/v1/reference_pages?select=image_url&image_url=like.*.png&order=image_url`, {
      headers: { ...auth, Range: `${from}-${from + 999}` },
    });
    if (!res.ok) throw new Error(`list reference_pages: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    rows.forEach((r) => paths.add(r.image_url));
    if (rows.length < 1000) break;
  }
  return [...paths];
}

// Coarse "same picture" guard: 64x64 greyscale mean absolute difference.
async function meanAbsDiff(a, b) {
  const px = (buf) => sharp(buf).resize(64, 64, { fit: 'fill' }).greyscale().raw().toBuffer();
  const [x, y] = await Promise.all([px(a), px(b)]);
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += Math.abs(x[i] - y[i]);
  return sum / x.length;
}

async function processOne(src) {
  const dst = src.replace(/\.png$/i, '.webp');
  const rec = { src, dst, pngBytes: 0, webpBytes: 0, status: '' };
  try {
    if (APPLY) {
      const head = await fetchRetry(objUrl(dst), { method: 'HEAD', headers: auth });
      if (head.ok && Number(head.headers.get('content-length')) > 0) {
        rec.status = 'exists';
        rec.webpBytes = Number(head.headers.get('content-length'));
        return rec;
      }
    }
    const res = await fetchRetry(objUrl(src), { headers: auth });
    if (!res.ok) throw new Error(`download ${res.status}`);
    const png = Buffer.from(await res.arrayBuffer());
    rec.pngBytes = png.length;

    const webp = await sharp(png).webp({ quality: QUALITY, effort: 5 }).toBuffer();
    rec.webpBytes = webp.length;
    if (webp.length >= png.length) {
      rec.status = 'skipped-not-smaller';
      return rec;
    }
    const [m1, m2] = await Promise.all([sharp(png).metadata(), sharp(webp).metadata()]);
    if (m1.width !== m2.width || m1.height !== m2.height) throw new Error('dimension mismatch');
    const diff = await meanAbsDiff(png, webp);
    if (diff > 6) throw new Error(`pixel diff too high (${diff.toFixed(2)})`);

    if (!APPLY) {
      rec.status = 'dry-ok';
      return rec;
    }
    const up = await fetchRetry(objUrl(dst), {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'image/webp', 'x-upsert': 'true', 'cache-control': 'max-age=31536000' },
      body: webp,
    });
    if (!up.ok) throw new Error(`upload ${up.status} ${await up.text()}`);
    const back = await fetchRetry(objUrl(dst), { headers: auth });
    const backBuf = Buffer.from(await back.arrayBuffer());
    if (!back.ok || backBuf.length !== webp.length) throw new Error('verify size mismatch');
    rec.status = 'uploaded';
    return rec;
  } catch (e) {
    rec.status = `FAILED: ${e.message}`;
    return rec;
  }
}


// PNG width/height live in the IHDR chunk: bytes 16..23 — a 32-byte range read is enough.
async function pngSize(path) {
  const res = await fetchRetry(objUrl(path), { headers: { ...auth, Range: 'bytes=0-31' } });
  if (!res.ok) throw new Error(`png header ${res.status}`);
  const b = Buffer.from(await res.arrayBuffer());
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

async function verifyOne(src) {
  const dst = src.replace(/\.png$/i, '.webp');
  const rec = { src, dst, pngBytes: 0, webpBytes: 0, status: '' };
  try {
    const res = await fetchRetry(objUrl(dst), { headers: auth });
    if (!res.ok) throw new Error(`webp download ${res.status}`);
    const webp = Buffer.from(await res.arrayBuffer());
    rec.webpBytes = webp.length;
    const m = await sharp(webp).metadata();
    if (m.format !== 'webp') throw new Error(`not webp (${m.format})`);
    await sharp(webp).resize(8, 8, { fit: 'fill' }).raw().toBuffer(); // forces a full decode
    const png = await pngSize(src);
    if (png.width !== m.width || png.height !== m.height) throw new Error('dimension mismatch');
    rec.status = 'verified';
  } catch (e) {
    rec.status = `FAILED: ${e.message}`;
  }
  return rec;
}

const all = await listPngPaths();
const todo = all.slice(0, LIMIT);
console.log(`${VERIFY ? 'VERIFY' : APPLY ? 'APPLY' : 'DRY RUN'}: ${todo.length} of ${all.length} PNG pages, concurrency ${CONCURRENCY}`);
writeFileSync(LOG, '');

let next = 0, done = 0;
const results = [];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < todo.length) {
      const rec = await (VERIFY ? verifyOne : processOne)(todo[next++]);
      results.push(rec);
      appendFileSync(LOG, JSON.stringify(rec) + '\n');
      if (++done % 25 === 0 || rec.status.startsWith('FAILED')) {
        console.log(`[${done}/${todo.length}] ${rec.src} -> ${rec.status}`);
      }
    }
  })
);

const sum = (f) => results.reduce((s, r) => s + f(r), 0);
const by = (s) => results.filter((r) => r.status === s).length;
const failed = results.filter((r) => r.status.startsWith('FAILED'));
const mb = (n) => (n / 1048576).toFixed(1);
const measured = results.filter((r) => r.pngBytes && r.webpBytes);
console.log(`\nverified=${by('verified')} ok(dry)=${by('dry-ok')} uploaded=${by('uploaded')} exists=${by('exists')} skipped=${by('skipped-not-smaller')} failed=${failed.length}`);
console.log(`measured pages=${measured.length}  PNG ${mb(sum((r) => (r.webpBytes ? r.pngBytes : 0)))} MB -> WebP ${mb(sum((r) => (r.pngBytes ? r.webpBytes : 0)))} MB`);
console.log(`log: ${LOG}`);
if (failed.length) {
  failed.slice(0, 10).forEach((r) => console.log('  ', r.src, r.status));
  process.exit(2);
}
