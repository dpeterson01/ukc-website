import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultSiteRoot = path.resolve(import.meta.dirname, '..', 'site');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error('Usage: node scripts/publish-bulletin.mjs --date YYYY-MM-DD --pdf /path/to/bulletin.pdf [--published-at ISO-8601]');
    }
    args[key.slice(2)] = value;
  }
  return args;
}

function validateDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
    throw new Error(`Invalid bulletin date: ${date ?? '(missing)'}`);
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid bulletin date: ${date}`);
  }
}

async function readArchive(manifestPath) {
  try {
    const archive = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (archive.version !== 1 || !Array.isArray(archive.issues)) {
      throw new Error('expected version 1 with an issues array');
    }
    return archive;
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, issues: [] };
    throw new Error(`Invalid bulletin archive manifest: ${error.message}`);
  }
}

export async function publishBulletin({ date, pdfPath, siteRoot = defaultSiteRoot, publishedAt }) {
  validateDate(date);
  if (!pdfPath) throw new Error('PDF path is required');

  const source = path.resolve(pdfPath);
  const sourceBytes = await readFile(source);
  if (!sourceBytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error(`${source} is not a PDF`);
  }

  const destinationDirectory = path.join(siteRoot, 'bulletins', date.slice(0, 4));
  const destinationName = `${date}-bulletin.pdf`;
  const destination = path.join(destinationDirectory, destinationName);
  const publicPath = `/bulletins/${date.slice(0, 4)}/${destinationName}`;
  const manifestPath = path.join(siteRoot, 'bulletins', 'index.json');
  const archive = await readArchive(manifestPath);
  const existing = archive.issues.find((issue) => issue.date === date);
  const timestamp = existing?.publishedAt ?? publishedAt ?? new Date().toISOString();
  if (Number.isNaN(new Date(timestamp).valueOf())) throw new Error(`Invalid publication timestamp: ${timestamp}`);

  const issue = {
    date,
    title: 'Weekly Parish Bulletin',
    path: publicPath,
    bytes: sourceBytes.length,
    sha256: createHash('sha256').update(sourceBytes).digest('hex'),
    publishedAt: timestamp,
  };
  archive.issues = [issue, ...archive.issues.filter((entry) => entry.date !== date)]
    .sort((left, right) => right.date.localeCompare(left.date));

  await mkdir(destinationDirectory, { recursive: true });
  await writeFile(destination, sourceBytes);
  await writeFile(manifestPath, `${JSON.stringify(archive, null, 2)}\n`);

  const destinationStat = await stat(destination);
  if (destinationStat.size !== sourceBytes.length) throw new Error('Published PDF size does not match source');
  return { destination, manifestPath, issue };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await publishBulletin({
      date: args.date,
      pdfPath: args.pdf,
      siteRoot: args['site-root'] ? path.resolve(args['site-root']) : defaultSiteRoot,
      publishedAt: args['published-at'],
    });
    console.log(`Published ${result.issue.path}`);
  } catch (error) {
    console.error(`publish-bulletin: ${error.message}`);
    process.exitCode = 1;
  }
}