import pino from 'pino';

export function createLogger(config) {
  const options = {
    level: config.logLevel,
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
        '*.password',
        '*.passwordHash',
        '*.token',
        '*.csrfToken',
      ],
      censor: '[redacted]',
    },
  };
  if (config.env === 'development') {
    return pino({ ...options, transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } } });
  }
  return pino(options);
}
