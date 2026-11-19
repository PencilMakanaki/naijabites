// Adds sample vendors and meals so the storefront has something to show while developing.
// Safe to run more than once. It refuses to run in production.
import { seedCatalogue } from '../catalogue/seed.js';
import { loadConfig } from '../config.js';
import { createPool } from '../db/pool.js';

const config = loadConfig();
if (config.isProduction) {
  console.error('This command is for development only and will not run when NODE_ENV=production.');
  process.exit(1);
}
const pool = createPool(config, { connectionLimit: 2 });
try {
  const counts = await seedCatalogue(pool);
  console.log(`Done. Added ${counts.vendors} vendors, ${counts.products} meals and ${counts.categories} categories (${counts.skipped} meals were already there).`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
