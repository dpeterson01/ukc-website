import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const site = path.join(root, 'site');
const origin = 'https://ukccatholic.org';
const errors = [];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function values(html, pattern) {
  return [...html.matchAll(pattern)].map((match) => match[1]);
}

function one(file, html, label, pattern) {
  const matches = values(html, pattern);
  if (matches.length !== 1) {
    errors.push(`${file}: expected one ${label}, found ${matches.length}`);
  }
  return matches[0] ?? '';
}

function decode(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'");
}

const pages = walk(site).filter((file) => file.endsWith(`${path.sep}index.html`));
const indexable = new Set();

for (const absoluteFile of pages) {
  const file = path.relative(root, absoluteFile).split(path.sep).join('/');
  const html = fs.readFileSync(absoluteFile, 'utf8');
  const directory = path.relative(site, path.dirname(absoluteFile)).split(path.sep).join('/');
  const pathname = directory ? `/${directory}/` : '/';
  const expectedCanonical = `${origin}${pathname}`;
  const isSpanish = pathname === '/es/' || pathname.startsWith('/es/');
  const englishPath = isSpanish ? pathname.replace(/^\/es(?=\/)/, '') : pathname;
  const spanishPath = isSpanish ? pathname : `/es${pathname}`;

  const title = decode(one(file, html, 'title', /<title>(.*?)<\/title>/gs));
  const description = decode(one(file, html, 'description', /<meta name="description" content="([^"]*)">/g));
  const canonical = one(file, html, 'canonical', /<link rel="canonical" href="([^"]*)">/g);
  const ogTitle = decode(one(file, html, 'og:title', /<meta property="og:title" content="([^"]*)">/g));
  const ogDescription = decode(one(file, html, 'og:description', /<meta property="og:description" content="([^"]*)">/g));
  const ogUrl = one(file, html, 'og:url', /<meta property="og:url" content="([^"]*)">/g);
  const ogImage = one(file, html, 'og:image', /<meta property="og:image" content="([^"]*)">/g);
  const twitterTitle = decode(one(file, html, 'twitter:title', /<meta name="twitter:title" content="([^"]*)">/g));
  const twitterDescription = decode(one(file, html, 'twitter:description', /<meta name="twitter:description" content="([^"]*)">/g));
  const englishAlternate = one(file, html, 'English alternate', /<link rel="alternate" hreflang="en" href="([^"]*)">/g);
  const spanishAlternate = one(file, html, 'Spanish alternate', /<link rel="alternate" hreflang="es" href="([^"]*)">/g);
  const defaultAlternate = one(file, html, 'default alternate', /<link rel="alternate" hreflang="x-default" href="([^"]*)">/g);

  if (title.length > 60) errors.push(`${file}: title is ${title.length} characters`);
  if (description.length < 120 || description.length > 160) {
    errors.push(`${file}: description is ${description.length} characters`);
  }
  if (canonical !== expectedCanonical) errors.push(`${file}: canonical should be ${expectedCanonical}`);
  if (ogUrl !== canonical) errors.push(`${file}: og:url does not match canonical`);
  if (ogTitle !== title || twitterTitle !== title) errors.push(`${file}: social title does not match title`);
  if (ogDescription !== description || twitterDescription !== description) {
    errors.push(`${file}: social description does not match description`);
  }
  if (!ogImage.startsWith(`${origin}/`)) errors.push(`${file}: og:image is not on the custom domain`);
  if (englishAlternate !== `${origin}${englishPath}`) errors.push(`${file}: incorrect English alternate`);
  if (spanishAlternate !== `${origin}${spanishPath}`) errors.push(`${file}: incorrect Spanish alternate`);
  if (defaultAlternate !== `${origin}${englishPath}`) errors.push(`${file}: incorrect default alternate`);
  if (html.includes('dpeterson01.github.io/ukc-website')) errors.push(`${file}: old hostname remains`);
  if (values(html, /<h1(?:\s[^>]*)?>/g).length !== 1) errors.push(`${file}: expected one h1`);

  if (!/<meta name="robots" content="[^"]*noindex/i.test(html)) {
    indexable.add(canonical);
  }
}

const sitemap = fs.readFileSync(path.join(site, 'sitemap.xml'), 'utf8');
const sitemapUrls = new Set(values(sitemap, /<loc>([^<]+)<\/loc>/g));
for (const url of indexable) {
  if (!sitemapUrls.has(url)) errors.push(`sitemap.xml: missing ${url}`);
}
for (const url of sitemapUrls) {
  if (!indexable.has(url)) errors.push(`sitemap.xml: unexpected ${url}`);
}

const robots = fs.readFileSync(path.join(site, 'robots.txt'), 'utf8');
if (!robots.includes(`Sitemap: ${origin}/sitemap.xml`)) errors.push('robots.txt: sitemap URL is incorrect');
if (fs.readFileSync(path.join(site, 'CNAME'), 'utf8').trim() !== 'ukccatholic.org') {
  errors.push('CNAME: custom domain is incorrect');
}

const home = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
const jsonLd = one('site/index.html', home, 'JSON-LD block', /<script type="application\/ld\+json">\s*(.*?)\s*<\/script>/gs);
try {
  const schema = JSON.parse(jsonLd);
  if (!Array.isArray(schema['@graph']) || schema['@graph'].length !== 4) {
    errors.push('site/index.html: JSON-LD graph should contain four entities');
  }
} catch (error) {
  errors.push(`site/index.html: invalid JSON-LD (${error.message})`);
}

if (errors.length) {
  console.error(`SEO verification failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`SEO verification passed for ${pages.length} pages (${indexable.size} indexable).`);