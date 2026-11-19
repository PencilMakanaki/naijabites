import { loadConfig } from '../config.js';
import { runMigrations } from '../db/migrate.js';

const command = process.argv[2] ?? 'status';
try {
  await runMigrations({ config: loadConfig(), direction: command });
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
