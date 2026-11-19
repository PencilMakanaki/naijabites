import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate, templateNames } from '../src/mail/templates.js';
import { retryDelayMs } from '../src/mail/retry.js';
import { summarizeUserAgent } from '../src/auth/userAgent.js';

test('every template renders subject, text and html with its link', () => {
  const link = 'https://naijabites.example/verify-email/abc123';
  for (const name of templateNames()) {
    const { subject, text, html } = renderTemplate(name, { name: 'Ada Okafor', link, newEmail: 'new@example.com' });
    assert.ok(subject.length > 5, name);
    assert.ok(text.includes('Ada'), `${name} greets by first name`);
    assert.ok(html.includes('Bites</span>'), `${name} html has the logo`);
    if (['verify_email', 'password_reset', 'email_change'].includes(name)) {
      assert.ok(text.includes(link), `${name} text has the link`);
      assert.ok(html.includes(`href="${link}"`), `${name} html has the link`);
    }
  }
});

test('names and links are escaped in the HTML version', () => {
  const { html, text } = renderTemplate('verify_email', { name: '<script>alert(1)</script>', link: 'https://x.test/a?b=1&c="2"' });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&amp;c=&quot;2&quot;'));
});

test('an unknown template is an error', () => {
  assert.throws(() => renderTemplate('nope', {}), /Unknown email template/);
});

test('missing names fall back to "there"', () => {
  assert.ok(renderTemplate('password_changed', {}).text.includes('there'));
});

test('retry delays grow: 1, 5, 15, 60 minutes', () => {
  assert.deepEqual([1, 2, 3, 4, 9].map(retryDelayMs), [60_000, 300_000, 900_000, 3_600_000, 3_600_000]);
});

test('devices are described in plain words', () => {
  assert.equal(summarizeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0'), 'Edge on Windows');
  assert.equal(summarizeUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'), 'Chrome on Android');
  assert.equal(summarizeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'), 'Safari on iOS');
  assert.equal(summarizeUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0'), 'Firefox on Linux');
  assert.equal(summarizeUserAgent(''), 'Browser on a device');
  assert.equal(summarizeUserAgent(undefined), 'Browser on a device');
});
