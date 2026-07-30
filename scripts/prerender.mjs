// One-time migration: snapshot each SPA route as a real static page.
//
// Run from /tmp/ukc-prerender (where playwright is installed):
//   cp scripts/prerender.mjs /tmp/ukc-prerender/ && node /tmp/ukc-prerender/prerender.mjs
//
// Loads site/index.html with the Claude Design runtime still active, lets React render
// each route, then writes the resulting DOM to site/<route>/index.html with the runtime
// stripped out. After this runs, those files are the source and the runtime is gone.
//
// Regenerating requires the pre-flatten template, so restore it from git first:
//   git show <pre-flatten-sha>:site/index.html > site/index.html
//   python3 scripts/migrate-buttons-to-anchors.py

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';

const SITE = '/Users/derekpeterson/projects/personal/ukc-website/site';
const PORT = 8791;
const BASE = 'https://dpeterson01.github.io/ukc-website/';

const ROUTES = [
  '', 'new', 'mass', 'about', 'sjb', 'ic', 'sjb-history', 'ic-history',
  'sacraments', 'formation', 'giving', 'watch', 'contact', 'prayer',
];

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json',
};

const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(SITE, p);
  try {
    await fs.access(file);
    res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
    createReadStream(file).pipe(res);
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const page = await browser.newPage();
const captured = {};

for (const route of ROUTES) {
  const url = `http://localhost:${PORT}/${route ? '#/' + route : ''}`;
  // The contact page holds a connection open, so networkidle never fires. Hydration is
  // the signal that matters: the runtime consumes <x-dc> once it has rendered.
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('x-dc').length === 0, { timeout: 20000 });
  await page.waitForTimeout(600);

  const html = await page.evaluate((absBase) => {
    // 1. Drop the runtime, the CDN React tags it injected, and its placeholder styles.
    document.querySelectorAll('script').forEach((s) => {
      const src = s.getAttribute('src') || '';
      if (src.includes('support.js') || src.includes('_ds_bundle.js') || src.includes('unpkg.com')) s.remove();
      if (s.type === 'text/x-dc') s.remove();
    });
    document.querySelectorAll('style').forEach((s) => {
      const css = s.textContent;
      if (css.includes('.sc-placeholder') || css.includes('sc-dc-streaming')) s.remove();
      // The runtime hid its own custom element and sized its mount point. Only the
      // page-height reset is still worth keeping.
      else if (css.includes('x-dc{display:none')) s.remove();
      else if (css.includes('#dc-root')) s.textContent = 'html,body{height:100%;margin:0}';
    });
    document.querySelectorAll('helmet').forEach((h) => h.remove());

    // 2. Hoist the design system stylesheet into <head> and drop duplicates.
    const sheets = [...document.querySelectorAll('link[rel="stylesheet"]')];
    sheets.forEach((l, i) => (i === 0 ? document.head.appendChild(l) : l.remove()));

    // 3. Strip the runtime's bookkeeping attributes.
    document.querySelectorAll('[data-dc-tpl], [data-sc-name], [data-dc-script]').forEach((el) => {
      el.removeAttribute('data-dc-tpl');
      el.removeAttribute('data-sc-name');
      el.removeAttribute('data-dc-script');
    });

    // 4. Unwrap the runtime's interpolation and host wrappers.
    const unwrap = (el) => el.replaceWith(...el.childNodes);
    document.querySelectorAll('span.sc-interp').forEach(unwrap);
    document.querySelectorAll('.sc-host').forEach(unwrap);
    const root = document.getElementById('dc-root');
    if (root) unwrap(root);
    document.querySelectorAll('[class=""]').forEach((el) => el.removeAttribute('class'));

    // 5. Social preview images need absolute URLs to resolve off-site.
    document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]').forEach((m) => {
      const v = m.getAttribute('content') || '';
      if (!/^https?:/.test(v)) m.setAttribute('content', absBase + v.replace(/^\.?\//, ''));
    });

    return '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
  }, BASE);

  captured[route] = html;
  console.log(`captured ${route || '(home)'} — ${html.length} bytes — ${await page.title()}`);
}

await browser.close();
server.close();

function rewrite(html, route) {
  const depth = route ? '../' : '';

  // Pages now sit one level down, so relative references need a hop up.
  if (depth) {
    html = html.replace(/(\s(?:src|href))="(?!https?:|mailto:|tel:|#|\/|\.\.\/|data:)([^"]*)"/g,
      (_m, attr, val) => `${attr}="${depth}${val.replace(/^\.\//, '')}"`);
  }

  // The register CTA scrolls in place on the New Here? page and links to it from elsewhere.
  if (!html.includes('id="register-section"')) {
    html = html.replace(/href="#register-section"/g, `href="${depth}new/#register-section"`);
  }

  html = html.replace('</head>',
    `<link rel="stylesheet" href="${depth}assets/site.css">\n` +
    `<link rel="canonical" href="${BASE}${route ? route + '/' : ''}">\n` +
    `<script src="${depth}assets/site.js" defer></script>\n</head>`);

  // Collapse the blank lines the runtime left behind.
  return html.replace(/\n[ \t]*\n[ \t]*\n+/g, '\n\n');
}

for (const [route, html] of Object.entries(captured)) {
  const out = route ? path.join(SITE, route, 'index.html') : path.join(SITE, 'index.html');
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, rewrite(html, route));
  console.log(`wrote ${path.relative(SITE, out)}`);
}

console.log('\ndone');
