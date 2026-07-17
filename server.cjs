const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const TMAPI_TOKEN = process.env.TMAPI_TOKEN || '';
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://tradeon.global';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.txt': 'text/plain',
};

// Simple in-memory OG cache to avoid hammering TMAPI (10 min TTL)
const ogCache = new Map();
const OG_TTL_MS = 10 * 60 * 1000;

function fetchJson(u) {
  return new Promise((resolve, reject) => {
    const lib = u.startsWith('https:') ? https : http;
    const req = lib.get(u, { headers: { Accept: 'application/json' }, timeout: 8000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
  });
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function normalizeImg(u) {
  if (!u) return '';
  let c = String(u).trim().replace(/\\/g, '').replace(/^['"]+|['"]+$/g, '');
  if (c.startsWith('//')) return 'https:' + c;
  return c;
}

async function getProductOg(productId) {
  const cached = ogCache.get(productId);
  if (cached && Date.now() - cached.ts < OG_TTL_MS) return cached.data;
  if (!TMAPI_TOKEN) return null;
  try {
    const apiUrl = `http://api.tmapi.top/1688/item_detail?apiToken=${encodeURIComponent(TMAPI_TOKEN)}&item_id=${encodeURIComponent(productId)}&language=en`;
    const j = await fetchJson(apiUrl);
    const d = j && j.data;
    if (!d) return null;
    const img = normalizeImg((Array.isArray(d.main_imgs) && d.main_imgs[0]) || '');
    const data = {
      title: d.title || 'TradeOn Global',
      image: img,
    };
    ogCache.set(productId, { ts: Date.now(), data });
    return data;
  } catch (e) {
    return null;
  }
}

function injectOg(html, { title, description, image, pageUrl }) {
  // Remove existing og:title / og:description / og:image / og:url / twitter:* image tags
  let out = html;
  const removePatterns = [
    /<meta\s+property=["']og:title["'][^>]*>\s*/gi,
    /<meta\s+property=["']og:description["'][^>]*>\s*/gi,
    /<meta\s+property=["']og:image[^"']*["'][^>]*>\s*/gi,
    /<meta\s+property=["']og:url["'][^>]*>\s*/gi,
    /<meta\s+name=["']twitter:title["'][^>]*>\s*/gi,
    /<meta\s+name=["']twitter:description["'][^>]*>\s*/gi,
    /<meta\s+name=["']twitter:image["'][^>]*>\s*/gi,
    /<title>[^<]*<\/title>\s*/i,
    /<meta\s+name=["']description["'][^>]*>\s*/gi,
  ];
  for (const re of removePatterns) out = out.replace(re, '');

  const injected = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:type" content="product" />`,
    `<meta property="og:url" content="${escapeHtml(pageUrl)}" />`,
    image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : '',
    image ? `<meta property="og:image:secure_url" content="${escapeHtml(image)}" />` : '',
    image ? `<meta property="og:image:width" content="800" />` : '',
    image ? `<meta property="og:image:height" content="800" />` : '',
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    image ? `<meta name="twitter:image" content="${escapeHtml(image)}" />` : '',
  ].filter(Boolean).join('\n    ');

  return out.replace(/<\/head>/i, `    ${injected}\n  </head>`);
}

function serveFile(res, filePath, contentType, cacheControl) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': cacheControl });
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  const parsed = url.parse(req.url || '/', true);
  let urlPath = (parsed.pathname || '/').split('?')[0];
  try { urlPath = decodeURIComponent(urlPath); } catch (e) {}

  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(ROOT, safePath);

  if (urlPath === '/assets/index-BQHE-_WD.js' || urlPath === '/assets/index-DaxjUk2z.js') {
    const latestBundle = path.join(ROOT, 'assets', 'tradeon-app-20260717-v6.js');
    serveFile(res, latestBundle, 'application/javascript', 'no-cache, no-store, must-revalidate');
    return;
  }

  let stat = null;
  try { stat = fs.statSync(filePath); } catch (e) {}

  // Product detail: intercept SPA root when ?product=<id> is present, or /p/:id
  const productMatch = urlPath.match(/^\/p\/([^/]+)\/?$/);
  const productId = productMatch ? productMatch[1] : (parsed.query && parsed.query.product);

  const isRoot = !stat || stat.isDirectory();

  if (isRoot && productId) {
    try {
      const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      const og = await getProductOg(String(productId));
      const pageUrl = `${SITE_ORIGIN}/?product=${encodeURIComponent(productId)}`;
      const title = og?.title ? `${og.title} — TradeOn Global` : 'TradeOn Global';
      const description = og?.title || 'TradeOn Global - Search and browse wholesale products with prices in BDT';
      const image = og?.image || `${SITE_ORIGIN}/favicon-20260701.png`;
      const html = injectOg(indexHtml, { title, description, image, pageUrl });
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      });
      res.end(html);
      return;
    } catch (e) {
      // fall through to normal serving
    }
  }

  if (isRoot) filePath = path.join(ROOT, 'index.html');

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mime[ext] || 'application/octet-stream';
  const baseName = path.basename(filePath).toLowerCase();
  const noCacheFiles = new Set(['index.html', 'favicon.ico', 'favicon.png', 'manifest.webmanifest', 'sw.js']);
  const noCacheExtensions = new Set(['.html', '.js', '.css']);
  const cacheControl = noCacheFiles.has(baseName) || noCacheExtensions.has(ext)
    ? 'no-cache, no-store, must-revalidate'
    : 'public, max-age=31536000, immutable';

  if (baseName === 'index.html' || baseName === 'sw.js') {
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'Pragma': 'no-cache',
        'Expires': '0',
        'Clear-Site-Data': '"cache"',
      });
      res.end(data);
    });
    return;
  }

  serveFile(res, filePath, contentType, cacheControl);
}).listen(PORT, () => {
  console.log(`TradeOn Global server running on port ${PORT}`);
});
