import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { publishBulletin } from './publish-bulletin.mjs';
import { archiveMarkup, buildBulletins, formatSize } from './build-bulletins.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'ukc-bulletin-publish-'));
const realSite = new URL('../site/', import.meta.url);
const displayScript = await readFile(new URL('assets/bulletin-archive.js', realSite), 'utf8');

async function display(data, locale = 'en', failed = false) {
  const latest = { dataset: { locale }, innerHTML: 'fallback' };
  vm.runInNewContext(displayScript, {
    document: { querySelector: (selector) => selector === '[data-bulletin-latest]' ? latest : null },
    fetch: async () => ({ ok: !failed, json: async () => data }),
    Intl,
  });
  await new Promise((resolve) => setImmediate(resolve));
  return latest.innerHTML;
}

const silent = { warn: () => {} };
const count = (html, pattern) => (html.match(pattern) || []).length;

try {
  const source = path.join(root, 'source.pdf');
  const siteRoot = path.join(root, 'site');
  const fixture = Buffer.from('%PDF-1.7\nfixture bulletin\n');
  await writeFile(source, fixture);
  // Real archive shells, so the publisher rebuilds them exactly as it does on the live site.
  for (const shell of ['bulletins/index.html', 'es/bulletins/index.html']) {
    await mkdir(path.dirname(path.join(siteRoot, shell)), { recursive: true });
    await cp(new URL(shell, realSite), path.join(siteRoot, shell));
  }
  const pages = {
    en: path.join(siteRoot, 'bulletins', 'index.html'),
    es: path.join(siteRoot, 'es', 'bulletins', 'index.html'),
  };

  const options = {
    date: '2026-09-20',
    pdfPath: source,
    siteRoot,
    publishedAt: '2026-09-18T16:47:08.000Z',
    titleEn: 'Twenty-fifth Sunday in Ordinary Time',
    titleEs: 'Vigésimo quinto Domingo del Tiempo Ordinario',
    season: 'ordinary',
    log: silent,
  };
  const first = await publishBulletin(options);
  const firstManifest = await readFile(first.manifestPath, 'utf8');
  const firstPage = await readFile(pages.en, 'utf8');
  await publishBulletin(options);
  assert.equal(await readFile(first.manifestPath, 'utf8'), firstManifest, 'publishing the same issue should be idempotent');
  assert.equal(await readFile(pages.en, 'utf8'), firstPage, 'rebuilding the same archive should be idempotent');
  assert.deepEqual(first.archivePages.sort(), [pages.en, pages.es].sort());

  assert.deepEqual(await readFile(first.destination), fixture);
  const archive = JSON.parse(firstManifest);
  assert.equal(archive.version, 1);
  assert.deepEqual(archive.issues.map(({ date }) => date), ['2026-09-20']);
  assert.equal(archive.issues[0].path, '/bulletins/2026/2026-09-20-bulletin.pdf');
  assert.equal(archive.issues[0].bytes, fixture.length);
  assert.match(archive.issues[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(archive.issues[0].publishedAt, options.publishedAt);
  assert.deepEqual(archive.issues[0].liturgicalTitle, { en: options.titleEn, es: options.titleEs });
  assert.equal(archive.issues[0].season, 'ordinary');

  // A rerun without titles keeps the ones the entry already has.
  await publishBulletin({ ...options, titleEn: undefined, titleEs: undefined, season: undefined });
  assert.equal(await readFile(first.manifestPath, 'utf8'), firstManifest, 'a rerun without titles keeps them');

  // 2026-09-27 is skipped on purpose; the year rolls over at the end.
  for (const date of ['2026-08-23', '2026-08-30', '2026-09-06', '2026-09-13', '2026-10-04', '2027-01-03']) {
    await publishBulletin({ ...options, date, titleEn: undefined, titleEs: undefined, season: undefined });
  }
  const fullArchive = JSON.parse(await readFile(first.manifestPath, 'utf8'));
  assert.equal(fullArchive.issues.length, 7, 'publishing retains the entire archive');
  for (const issue of fullArchive.issues) {
    assert.deepEqual(await readFile(path.join(siteRoot, issue.path)), fixture);
  }

  for (const locale of ['en', 'es']) {
    const html = await readFile(pages[locale], 'utf8');
    const region = html.slice(html.indexOf('<!-- bulletins:start -->'), html.indexOf('<!-- bulletins:end -->'));
    assert.equal(count(region, /href="\/bulletins\/\d{4}\/[\d-]+-bulletin\.pdf"/g), 7, 'every published issue is linked');
    assert.equal(count(region, /bulletin-latest-card__pdf/g), 1);
    assert.ok(region.indexOf('2027-01-03-bulletin.pdf') < region.indexOf('2026-10-04-bulletin.pdf'), 'newest first');
    assert.equal(count(region, /data-event-position="recent"/g), 3, 'three previous weeks');
    assert.equal(count(region, /data-event-position="older"/g), 3);
    assert.ok(!region.includes('2026-09-27'), 'a skipped week leaves no card');
    assert.ok(region.includes('id="bulletin-year-2026"'), 'older issues are grouped by year');
    assert.equal(count(region, /<details class="bulletin-year"/g), 1, 'a year before the latest issue collapses');
    assert.ok(region.includes(locale === 'es' ? '3 boletines' : '3 bulletins'), 'collapsed year shows its count');
    assert.ok(region.includes(locale === 'es' ? 'Vigésimo quinto Domingo' : 'Twenty-fifth Sunday'), 'liturgical title when known');
    assert.ok(region.includes(locale === 'es' ? 'domingo, 3 de enero de 2027' : 'Sunday, January 3, 2027'), 'date heading when no title');
    assert.ok(region.includes('href="../email/"'), 'one signup link, inside the same language tree');
    if (locale === 'es') assert.ok(region.includes('Abrir PDF en inglés') && region.includes('solo está disponible en inglés'));
    assert.ok(!region.includes('<script'), 'no script in the archive');
    assert.ok(!html.includes('bulletin-archive.js'), 'the archive page needs no JavaScript');
  }

  // Several years: the latest issue's year stays open, earlier years collapse, jump links lead to each.
  const spread = [];
  for (const year of [2027, 2026, 2025]) for (const day of ['12-26', '12-19', '06-07', '01-04']) {
    const date = `${year}-${day}`;
    spread.push({ date, path: `/bulletins/${year}/${date}-bulletin.pdf`, bytes: 1000 });
  }
  const years = archiveMarkup({ version: 1, issues: spread }, 'en');
  assert.equal(count(years, /<details class="bulletin-year"/g), 2);
  assert.ok(!/<details[^>]*>\s*<summary><h3[^>]*>2027/.test(years), 'the latest year is not collapsed');
  assert.ok(years.includes('<a href="#bulletin-year-2025">2025</a>'));
  assert.ok(years.includes('4 bulletins'));

  // An issue with a summary page links its title there and keeps a direct PDF link.
  const withSummary = archiveMarkup({ version: 1, issues: spread.map((issue, index) => (index < 2 ? { ...issue, summary: true } : issue)) }, 'es');
  assert.ok(withSummary.includes('href="2027-12-26/"') && withSummary.includes('Leer el resumen semanal'));
  assert.ok(withSummary.includes('href="2027-12-19/" data-event="bulletin_summary_open" data-event-position="recent"'));
  assert.equal(count(withSummary, /href="\/bulletins\/2027\/2027-12-19-bulletin\.pdf"/g), 1, 'the PDF stays one tap away');
  assert.ok(!years.includes('bulletin_summary_open'), 'no summary link without a summary page');

  const empty = archiveMarkup({ version: 1, issues: [] }, 'en');
  assert.ok(empty.includes('No bulletins have been published yet.'));
  assert.ok(!empty.includes('bulletin-row'));

  const hostile = archiveMarkup({ version: 1, issues: [
    null,
    { ...fullArchive.issues[0], date: '2026-02-30' },
    { ...fullArchive.issues[0], date: '2026-12-27', path: 'javascript:alert(1)' },
    { ...fullArchive.issues[0], date: '2026-12-20', bytes: -1 },
    { ...fullArchive.issues[0], date: '2026-12-13', path: '/bulletins/2026/2026-12-13-bulletin.pdf', liturgicalTitle: { en: '<img src=x onerror=alert(1)> Very long Sunday title that wraps', es: 'x' } },
  ] }, 'en');
  assert.ok(!hostile.includes('javascript:'));
  assert.ok(!hostile.includes('<img'), 'titles are escaped');
  assert.equal(count(hostile, /bulletin-latest-card__pdf/g), 1);

  assert.equal(formatSize(284486, 'en'), '278 KB');
  assert.equal(formatSize(3164770, 'en'), '3.0 MB');
  assert.equal(formatSize(3164770, 'es'), '3,0 MB');

  // Check mode reports a stale page and changes nothing.
  await writeFile(pages.es, (await readFile(pages.es, 'utf8')).replace('Abrir PDF en inglés', 'stale'));
  const checked = await buildBulletins({ siteRoot, check: true });
  assert.deepEqual(checked.stale, [pages.es]);
  assert.ok((await readFile(pages.es, 'utf8')).includes('stale'));

  // A broken shell warns but does not block the PDF publish the email depends on.
  await writeFile(pages.en, '<html>no markers</html>');
  const warnings = [];
  const degraded = await publishBulletin({ ...options, date: '2027-01-10', log: { warn: (line) => warnings.push(line) } });
  assert.ok(warnings.some((line) => line.includes('archive pages not rebuilt')));
  assert.deepEqual(await readFile(degraded.destination), fixture);

  await assert.rejects(publishBulletin({ ...options, titleEs: undefined }), /Pass both --title-en and --title-es/);
  await assert.rejects(publishBulletin({ ...options, season: 'purple' }), /Invalid season/);

  // The Home and Watch strip still reads the manifest in the browser.
  for (const locale of ['en', 'es']) {
    const latest = await display(fullArchive, locale);
    assert.equal(count(latest, /<a /g), 2);
    assert.ok(latest.includes('2027-01-03-bulletin.pdf'));
    assert.ok(latest.includes(`href="${locale === 'es' ? '/es' : ''}/bulletins/"`));
    if (locale === 'es') assert.ok(latest.includes('PDF en inglés'));
    for (const data of [null, {}, { issues: 'invalid' }, { issues: [] }]) {
      assert.equal(await display(data, locale), 'fallback');
    }
    assert.equal(await display(fullArchive, locale, true), 'fallback');
  }
  assert.equal(await display({ issues: [null,
    { ...fullArchive.issues[0], date: '2026-02-30' },
    { ...fullArchive.issues[0], path: 'javascript:alert(1)' },
    { ...fullArchive.issues[0], bytes: -1 },
  ] }), 'fallback');

  await assert.rejects(publishBulletin({ ...options, date: '2026-02-30' }), /Invalid bulletin date/);
  const notPdf = path.join(root, 'not-a-pdf.txt');
  await writeFile(notPdf, 'not a PDF');
  await assert.rejects(publishBulletin({ ...options, pdfPath: notPdf }), /is not a PDF/);

  console.log('publish-bulletin test: OK');
} finally {
  await rm(root, { recursive: true, force: true });
}
