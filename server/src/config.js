import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// Loads the .env file at the project root (if there is one). Real environment variables win.
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_ORIGIN: z.string().url().default('http://localhost:3000'),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3307),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_MIGRATOR_USER: z.string().optional(),
  DB_MIGRATOR_PASSWORD: z.string().optional(),
  CSRF_SECRET: z.string().min(32, 'CSRF_SECRET must be at least 32 characters'),
  SESSION_DAYS_CUSTOMER: z.coerce.number().positive().default(30),
  SESSION_HOURS_STAFF: z.coerce.number().positive().default(12),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().min(3).default('NaijaBites <no-reply@naijabites.local>'),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),
});

export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid settings. Check your .env file:\n${lines.join('\n')}`);
  }

  const e = parsed.data;
  const appOrigin = new URL(e.APP_ORIGIN).origin;
  const clientOrigin = new URL(e.CLIENT_ORIGIN).origin;
  const isProduction = e.NODE_ENV === 'production';

  if (isProduction && !appOrigin.startsWith('https://')) {
    throw new Error('Invalid settings. APP_ORIGIN must start with https:// in production.');
  }

  if (isProduction && !clientOrigin.startsWith('https://')) {
    throw new Error('Invalid settings. CLIENT_ORIGIN must start with https:// in production.');
  }

  if (isProduction && !e.SMTP_HOST) {
    throw new Error('Invalid settings. SMTP_HOST (an email provider) is required in production.');
  }

  return Object.freeze({
    env: e.NODE_ENV,
    isProduction,
    port: e.PORT,
    appOrigin,
    clientOrigin,
    logLevel: e.LOG_LEVEL,
    trustProxy: e.TRUST_PROXY,
    db: Object.freeze({
      host: e.DB_HOST,
      port: e.DB_PORT,
      name: e.DB_NAME,
      user: e.DB_USER,
      password: e.DB_PASSWORD,
    }),
    migrator: Object.freeze({
      user: e.DB_MIGRATOR_USER || e.DB_USER,
      password: e.DB_MIGRATOR_PASSWORD || e.DB_PASSWORD,
    }),
    csrfSecret: e.CSRF_SECRET,
    session: Object.freeze({
      customerDays: e.SESSION_DAYS_CUSTOMER,
      staffHours: e.SESSION_HOURS_STAFF,
    }),
    mailFrom: e.MAIL_FROM,
    paystack: Object.freeze({
      secretKey: e.PAYSTACK_SECRET_KEY || null,
      webhookSecret: e.PAYSTACK_WEBHOOK_SECRET || null,
      enabled: Boolean(e.PAYSTACK_SECRET_KEY),
    }),
    smtp: e.SMTP_HOST
      ? Object.freeze({
          host: e.SMTP_HOST,
          port: e.SMTP_PORT,
          secure: e.SMTP_SECURE === 'true',
          user: e.SMTP_USER || undefined,
          password: e.SMTP_PASSWORD || undefined,
        })
      : null,
  });
}