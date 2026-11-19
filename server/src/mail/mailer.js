// Sends one email. Without SMTP settings (normal in development) it only writes the email,
// including its links, to the server log so you can click them.
export async function createMailer(config, logger) {
  if (!config.smtp) {
    return {
      kind: 'log',
      async send(message) {
        logger.info(`EMAIL NOT SENT (no SMTP settings). To: ${message.to}\nSubject: ${message.subject}\n${message.text}`);
      },
    };
  }
  const { default: nodemailer } = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
  });
  return {
    kind: 'smtp',
    async send(message) {
      await transport.sendMail({ from: config.mailFrom, to: message.to, subject: message.subject, text: message.text, html: message.html });
    },
  };
}
