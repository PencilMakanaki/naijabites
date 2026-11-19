// Email wording. Pure functions: easy to test, no sending here.

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout({ heading, paragraphs, button, footer }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#15382d">${escapeHtml(p)}</p>`).join('');
  const cta = button
    ? `<p style="margin:22px 0"><a href="${escapeHtml(button.href)}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#064a35;color:#ffffff;font-weight:700;text-decoration:none">${escapeHtml(button.label)}</a></p>
       <p style="margin:0 0 14px;font-size:13px;color:#61716b">If the button does not work, copy this address into your browser:<br>${escapeHtml(button.href)}</p>`
    : '';
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#fbf8ef;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:28px;background:#fffdf8;border:1px solid #e9e4d8;border-radius:14px">
<p style="margin:0 0 18px;font-size:22px;font-weight:800;color:#064a35">Naija<span style="color:#f47a24">Bites</span></p>
<h1 style="margin:0 0 16px;font-size:20px;color:#15382d">${escapeHtml(heading)}</h1>${body}${cta}
<p style="margin:18px 0 0;font-size:12px;color:#61716b">${escapeHtml(footer)}</p></div></body></html>`;
}

const first = (name) => String(name ?? '').trim().split(/\s+/)[0] || 'there';

const TEMPLATES = {
  verify_email: ({ name, link }) => ({
    subject: 'Confirm your email address',
    heading: `Welcome to NaijaBites, ${first(name)}`,
    paragraphs: ['Please confirm your email address so we can send you order updates and help you recover your account.', 'This link works for 24 hours.'],
    button: { label: 'Confirm email address', href: link },
    footer: 'If you did not create a NaijaBites account, you can ignore this email.',
  }),
  password_reset: ({ name, link }) => ({
    subject: 'Reset your NaijaBites password',
    heading: `Reset your password, ${first(name)}`,
    paragraphs: ['We received a request to reset your password. This link works for 1 hour and can be used once.'],
    button: { label: 'Choose a new password', href: link },
    footer: 'If you did not ask for this, you can ignore this email. Your password will not change.',
  }),
  email_change: ({ name, link, newEmail }) => ({
    subject: 'Confirm your new email address',
    heading: `Confirm your new email, ${first(name)}`,
    paragraphs: [`We received a request to change your NaijaBites email to ${newEmail}. This link works for 1 hour.`],
    button: { label: 'Confirm new email address', href: link },
    footer: 'If you did not ask for this, ignore this email and your address will stay the same.',
  }),
  email_changed_notice: ({ name, newEmail }) => ({
    subject: 'Your NaijaBites email address was changed',
    heading: `Your email was changed, ${first(name)}`,
    paragraphs: [`The email on your NaijaBites account is now ${newEmail}.`, 'If this was not you, contact NaijaBites support straight away.'],
    button: null,
    footer: 'This message was sent to your previous email address for your security.',
  }),
  password_changed: ({ name }) => ({
    subject: 'Your NaijaBites password was changed',
    heading: `Your password was changed, ${first(name)}`,
    paragraphs: ['The password on your NaijaBites account was just changed, and you were signed out on your other devices.', 'If this was not you, reset your password now and contact NaijaBites support.'],
    button: null,
    footer: 'This is a security message from NaijaBites.',
  }),
};

export function templateNames() {
  return Object.keys(TEMPLATES);
}

/** Returns { subject, text, html } or throws for an unknown template. */
export function renderTemplate(name, data = {}) {
  const make = TEMPLATES[name];
  if (!make) throw new Error(`Unknown email template: ${name}`);
  const t = make(data);
  const text = [t.heading, '', ...t.paragraphs, ...(t.button ? ['', `${t.button.label}: ${t.button.href}`] : []), '', t.footer, '', 'NaijaBites'].join('\n');
  return { subject: t.subject, text, html: layout(t) };
}
