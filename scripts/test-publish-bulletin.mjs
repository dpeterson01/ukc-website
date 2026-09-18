import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { publishBulletin } from './publish-bulletin.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'ukc-bulletin-publish-'));
const displayScript = await readFile(new URL('../site/assets/bulletin-archive.js', import.meta.url), 'utf8');

async function display(data, locale = 'en', failed = false, archivePresent = true) {
  const archive = archivePresent ? { dataset: { locale }, innerHTML: '' } : null;
  const latest = { dataset: { locale }, innerHTML: 'fallback' };
  vm.runInNewContext(displayScript, {
    document: { querySelector: (selector) => selector === '[data-bulletin-archive]' ? archive : latest },
    fetch: async () => ({ ok: !failed, json: async () => data }),
    Intl,
  });
  await new Promise((resolve) => setImmediate(resolve));
  return { archive: archive?.innerHTML, latest: latest.innerHTML };
}

try {
  const source = path.join(root, 'source.pdf');
  const siteRoot = path.join(root, 'site');
  const fixture = Buffer.from('%PDF-1.7\nfixture bulletin\n');
  await writeFile(source, fixture);

  const options = {
    date: '2026-09-20',
    pdfPath: source,
    siteRoot,
    publishedAt: '2026-09-18T16:47:08.000Z',
  };
  const first = await publishBulletin(options);
  const firstManifest = await readFile(first.manifestPath, 'utf8');
  await publishBulletin(options);
  const secondManifest = await readFile(first.manifestPath, 'utf8');

  assert.deepEqual(await readFile(first.destination), fixture);
  assert.equal(firstManifest, secondManifest, 'publishing the same issue should be idempotent');

  const archive = JSON.parse(firstManifest);
  assert.equal(archive.version, 1);
  assert.deepEqual(archive.issues.map(({ date }) => date), ['2026-09-20']);
  assert.equal(archive.issues[0].path, '/bulletins/2026/2026-09-20-bulletin.pdf');
  assert.equal(archive.issues[0].bytes, fixture.length);
  assert.match(archive.issues[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(archive.issues[0].publishedAt, options.publishedAt);

  for (const date of ['2026-08-23', '2026-08-30', '2026-09-06', '2026-09-13']) {
    await publishBulletin({ ...options, date });
  }
  const fullArchive = JSON.parse(await readFile(first.manifestPath, 'utf8'));
  assert.equal(fullArchive.issues.length, 5, 'publishing retains the entire archive');
  for (const issue of fullArchive.issues) {
    assert.deepEqual(await readFile(path.join(siteRoot, issue.path)), fixture);
  }
  for (const locale of ['en', 'es']) {
    const shuffled = { issues: [...fullArchive.issues].reverse().concat(fullArchive.issues[0]) };
    const shown = await display(shuffled, locale);
    assert.equal((shown.archive.match(/<article /g) || []).length, 4);
    assert.ok(!shown.archive.includes('2026-08-23-bulletin.pdf'));
    assert.ok(shown.archive.indexOf('2026-09-20-bulletin.pdf') < shown.archive.indexOf('2026-09-13-bulletin.pdf'));
    assert.equal((shown.latest.match(/<a /g) || []).length, 2);
    assert.equal((shown.latest.match(/-bulletin.pdf"/g) || []).length, 1);
    assert.ok(shown.latest.includes(`href="${locale === 'es' ? '/es' : ''}/bulletins/"`));
    assert.ok(shown.latest.includes('2026-09-20-bulletin.pdf'), 'Sunday issue published Friday is already latest');
    assert.ok(!shown.latest.includes('2026-09-13-bulletin.pdf'));
    assert.equal((await display(shuffled, locale, false, false)).latest, shown.latest);
    if (locale === 'es') assert.ok(shown.latest.includes('PDF en inglés'));
    for (const count of [0, 1, 4]) {
      const limited = await display({ issues: fullArchive.issues.slice(0, count) }, locale);
      assert.equal((limited.archive.match(/<article /g) || []).length, count);
      if (!count) assert.equal(limited.latest, 'fallback');
    }
    for (const data of [null, {}, { issues: 'invalid' }]) {
      const invalid = await display(data, locale);
      assert.ok(invalid.archive.includes('role="status"'));
      assert.equal(invalid.latest, 'fallback');
    }
    assert.equal((await display(fullArchive, locale, true)).latest, 'fallback');
  }
  const malicious = await display({ issues: [null,
    { ...fullArchive.issues[0], date: '2026-02-30' },
    { ...fullArchive.issues[0], path: 'javascript:alert(1)' },
    { ...fullArchive.issues[0], bytes: -1 },
  ] });
  assert.ok(!malicious.archive.includes('<article '));
  assert.equal(malicious.latest, 'fallback');

  await assert.rejects(
    publishBulletin({ ...options, date: '2026-02-30' }),
    /Invalid bulletin date/,
  );
  const notPdf = path.join(root, 'not-a-pdf.txt');
  await writeFile(notPdf, 'not a PDF');
  await assert.rejects(
    publishBulletin({ ...options, pdfPath: notPdf }),
    /is not a PDF/,
  );

  console.log('publish-bulletin test: OK');
} finally {
  await rm(root, { recursive: true, force: true });
}