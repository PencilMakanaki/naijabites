import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { createLogger } from './logger.js';
import { createMailer } from './mail/mailer.js';
import { startMailWorker } from './mail/outbox.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const logger = createLogger(config);
const pool = createPool(config);
const clientDir = process.env.CLIENT_DIR
  ? resolve(process.env.CLIENT_DIR)
  : fileURLToPath(new URL('../../client/dist', import.meta.url));
const app = createApp({ config, logger, pool, clientDir });
const mailer = await createMailer(config, logger);
const mailWorker = startMailWorker({ pool, mailer, logger, config });

const server = app.listen(config.port, () => {
  logger.info(`NaijaBites API listening on ${config.appOrigin} (port ${config.port}, ${config.env})`);
});

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  mailWorker.stop();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => { logger.error({ err: reason }, 'Unhandled rejection'); });
