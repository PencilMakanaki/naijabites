import { withTransaction } from '../db/pool.js';
import { retryDelayMs } from './retry.js';
import { renderTemplate } from './templates.js';

const MAX_ATTEMPTS = 5;

/** Queue an email. Pass the same connection as the change that causes it, so both happen or neither does. */
export async function enqueueEmail(db, { to, template, data }) {
  await db.execute('INSERT INTO email_outbox (to_email, template, payload) VALUES (?, ?, ?)', [to, template, JSON.stringify(data ?? {})]);
}

export function startMailWorker({ pool, mailer, logger, config, intervalMs = 5000 }) {
  let busy = false;

  async function claimNext() {
    return withTransaction(pool, async (connection) => {
      const [rows] = await connection.execute(
        `SELECT id, to_email, template, payload, attempts FROM email_outbox
          WHERE status = 'queued' AND send_after <= UTC_TIMESTAMP(3)
          ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );
      if (rows.length === 0) return null;
      await connection.execute("UPDATE email_outbox SET status = 'sending' WHERE id = ?", [rows[0].id]);
      return rows[0];
    });
  }

  async function processOne() {
    const row = await claimNext();
    if (!row) return false;
    try {
      const data = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
      const message = renderTemplate(row.template, data);
      await mailer.send({ to: row.to_email, ...message });
      // In production the one-time links are removed from the stored copy once the email is sent.
      if (config.isProduction) {
        await pool.execute("UPDATE email_outbox SET status = 'sent', sent_at = UTC_TIMESTAMP(3), payload = JSON_OBJECT() WHERE id = ?", [row.id]);
      } else {
        await pool.execute("UPDATE email_outbox SET status = 'sent', sent_at = UTC_TIMESTAMP(3) WHERE id = ?", [row.id]);
      }
    } catch (err) {
      const attempts = row.attempts + 1;
      logger.error({ err, emailId: row.id, attempts }, 'Email sending failed');
      if (attempts >= MAX_ATTEMPTS) {
        await pool.execute("UPDATE email_outbox SET status = 'failed', attempts = ?, last_error = ? WHERE id = ?", [attempts, String(err.message).slice(0, 500), row.id]);
      } else {
        await pool.execute(
          "UPDATE email_outbox SET status = 'queued', attempts = ?, last_error = ?, send_after = ? WHERE id = ?",
          [attempts, String(err.message).slice(0, 500), new Date(Date.now() + retryDelayMs(attempts)), row.id],
        );
      }
    }
    return true;
  }

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      for (let i = 0; i < 25; i += 1) {
        if (!(await processOne())) break;
      }
    } catch (err) {
      logger.error({ err }, 'Mail worker error');
    } finally {
      busy = false;
    }
  }

  // Anything left half-sent by a crash goes back in the queue.
  pool.execute("UPDATE email_outbox SET status = 'queued' WHERE status = 'sending'").catch(() => {});
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  setTimeout(tick, 500).unref();
  logger.info(`Email worker started (${mailer.kind === 'smtp' ? 'sending through SMTP' : 'development mode: emails are written to this log'})`);
  return { stop: () => clearInterval(timer), tick };
}
