import { createHash } from 'node:crypto';

// Migration files: V001__short_name.up.sql and V001__short_name.down.sql, numbered 1, 2, 3...
const FILE_RE = /^V(\d{3,6})__([a-z0-9_]+)\.(up|down)\.sql$/;

export function checksum(text) {
  return createHash('sha256').update(String(text).replace(/\r\n/g, '\n')).digest('hex');
}

export function parseMigrationFile(fileName) {
  const match = FILE_RE.exec(fileName);
  if (!match) return null;
  return { version: Number(match[1]), name: match[2], direction: match[3], file: fileName };
}

/** Groups file names into migrations and reports problems (gaps, duplicates, missing up or down). */
export function collectMigrations(fileNames) {
  const byVersion = new Map();
  const problems = [];
  for (const file of fileNames) {
    if (!file.endsWith('.sql')) continue;
    const parsed = parseMigrationFile(file);
    if (!parsed) { problems.push(`Unexpected file name: ${file}`); continue; }
    const entry = byVersion.get(parsed.version) ?? { version: parsed.version, name: parsed.name, up: null, down: null };
    if (entry.name !== parsed.name) problems.push(`Version ${parsed.version} has two different names`);
    if (entry[parsed.direction]) problems.push(`Duplicate ${parsed.direction} file for version ${parsed.version}`);
    entry[parsed.direction] = file;
    byVersion.set(parsed.version, entry);
  }
  const migrations = [...byVersion.values()].sort((a, b) => a.version - b.version);
  migrations.forEach((m, index) => {
    if (!m.up) problems.push(`Version ${m.version} has no up file`);
    if (!m.down) problems.push(`Version ${m.version} has no down file`);
    if (m.version !== index + 1) problems.push(`Versions must be consecutive from 1: expected ${index + 1}, found ${m.version}`);
  });
  return { migrations, problems };
}

/** available: [{ version, name, upChecksum }]; applied: [{ version, checksum }]. */
export function planUp(available, applied) {
  const problems = [];
  const appliedVersions = new Set(applied.map((a) => a.version));
  for (const a of applied) {
    const m = available.find((x) => x.version === a.version);
    if (!m) { problems.push(`Applied migration ${a.version} is missing from disk`); continue; }
    if (m.upChecksum !== a.checksum) problems.push(`Migration ${a.version} (${m.name}) was changed after it was applied`);
  }
  const pending = available.filter((m) => !appliedVersions.has(m.version));
  const latest = applied.reduce((max, a) => Math.max(max, a.version), 0);
  if (pending.some((m) => m.version < latest)) problems.push('A migration older than the latest applied one has not been applied');
  return { pending, problems };
}

/** The version to roll back (the newest applied one), or null when nothing is applied. */
export function planDown(applied) {
  if (applied.length === 0) return null;
  return applied.reduce((max, a) => Math.max(max, a.version), 0);
}
