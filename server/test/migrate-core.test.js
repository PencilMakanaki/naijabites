import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checksum, collectMigrations, parseMigrationFile, planDown, planUp } from '../src/db/migrate-core.js';

test('file names are parsed strictly', () => {
  assert.deepEqual(parseMigrationFile('V001__accounts.up.sql'), { version: 1, name: 'accounts', direction: 'up', file: 'V001__accounts.up.sql' });
  assert.equal(parseMigrationFile('V1__accounts.up.sql'), null);
  assert.equal(parseMigrationFile('V001_accounts.up.sql'), null);
  assert.equal(parseMigrationFile('V001__Accounts.up.sql'), null);
  assert.equal(parseMigrationFile('notes.txt'), null);
});

test('the real migrations folder is complete and consecutive', () => {
  const dir = fileURLToPath(new URL('../migrations/', import.meta.url));
  const { migrations, problems } = collectMigrations(readdirSync(dir));
  assert.deepEqual(problems, []);
  assert.ok(migrations.length >= 4);
  assert.deepEqual(migrations.map((m) => m.version), migrations.map((_, i) => i + 1));
});

test('gaps, duplicates and missing down files are reported', () => {
  const gap = collectMigrations(['V001__a.up.sql', 'V001__a.down.sql', 'V003__c.up.sql', 'V003__c.down.sql']);
  assert.ok(gap.problems.some((p) => p.includes('consecutive')));
  const noDown = collectMigrations(['V001__a.up.sql']);
  assert.ok(noDown.problems.some((p) => p.includes('no down file')));
  const dup = collectMigrations(['V001__a.up.sql', 'V001__b.up.sql', 'V001__a.down.sql']);
  assert.ok(dup.problems.length >= 1);
  const stray = collectMigrations(['V001__a.up.sql', 'V001__a.down.sql', 'oops.sql']);
  assert.ok(stray.problems.some((p) => p.includes('Unexpected')));
});

test('planUp finds pending work and detects edited or missing migrations', () => {
  const available = [
    { version: 1, name: 'a', upChecksum: 'h1' },
    { version: 2, name: 'b', upChecksum: 'h2' },
    { version: 3, name: 'c', upChecksum: 'h3' },
  ];
  assert.deepEqual(planUp(available, [{ version: 1, checksum: 'h1' }]).pending.map((m) => m.version), [2, 3]);
  assert.deepEqual(planUp(available, []).problems, []);
  assert.ok(planUp(available, [{ version: 1, checksum: 'CHANGED' }]).problems[0].includes('changed'));
  assert.ok(planUp(available, [{ version: 9, checksum: 'x' }]).problems[0].includes('missing'));
  assert.ok(planUp(available, [{ version: 2, checksum: 'h2' }]).problems.some((p) => p.includes('older')));
});

test('planDown picks the newest applied version', () => {
  assert.equal(planDown([]), null);
  assert.equal(planDown([{ version: 1 }, { version: 3 }, { version: 2 }]), 3);
});

test('checksum ignores Windows line endings', () => {
  assert.equal(checksum('a\r\nb'), checksum('a\nb'));
  assert.notEqual(checksum('a'), checksum('b'));
});
