import readline from 'node:readline';
import { Writable } from 'node:stream';
import { MESSAGES, isValidEmail, isValidFullName, normalizeEmail, normalizeName, passwordProblem } from '@naijabites/shared/rules';
import { loadConfig } from '../config.js';
import { createPool, withTransaction } from '../db/pool.js';
import { hashPassword } from '../security/passwords.js';
import { ulid } from '../security/ids.js';

function prompt(question, { hidden = false } = {}) {
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
    muted = hidden;
  });
}

async function main() {
  const config = loadConfig();
  console.log('Create the first NaijaBites administrator (full access).');
  const name = normalizeName(await prompt('Full name: '));
  if (!isValidFullName(name)) throw new Error(MESSAGES.name);
  const email = normalizeEmail(await prompt('Email: '));
  if (!isValidEmail(email)) throw new Error(MESSAGES.email);
  const password = await prompt('Password (hidden): ', { hidden: true });
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const again = await prompt('Repeat password (hidden): ', { hidden: true });
  if (again !== password) throw new Error('The passwords do not match.');

  const pool = createPool(config, { connectionLimit: 2 });
  try {
    const passwordHash = await hashPassword(password);
    const publicId = ulid();
    await withTransaction(pool, async (connection) => {
      const [existing] = await connection.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
      if (existing.length) throw new Error('An account with this email already exists.');
      const [result] = await connection.execute(
        `INSERT INTO users (public_id, full_name, email, email_verified_at, password_hash, password_changed_at)
         VALUES (?, ?, ?, UTC_TIMESTAMP(3), ?, UTC_TIMESTAMP(3))`,
        [publicId, name, email, passwordHash],
      );
      const userId = result.insertId;
      await connection.execute("INSERT INTO user_roles (user_id, role) VALUES (?, 'admin')", [userId]);
      await connection.execute("INSERT INTO admin_profiles (user_id, level) VALUES (?, 'super')", [userId]);
      await connection.execute(
        `INSERT INTO audit_log (actor_user_id, actor_role, action, entity_type, entity_id, after_json)
         VALUES (NULL, 'system', 'admin.created_via_cli', 'user', ?, ?)`,
        [publicId, JSON.stringify({ email, level: 'super' })],
      );
    });
    console.log(`Done. ${email} can now sign in as an administrator.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
