import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { publishBulletin } from './publish-bulletin.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'ukc-bulletin-publish-'));

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