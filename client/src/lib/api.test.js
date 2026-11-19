import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApi } from './api.js';

function fakeServer(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const { status = 200, body } = await handler({ url, init, calls });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => { if (body === undefined) throw new Error('no body'); return body; },
    };
  };
  return { fetchImpl, calls };
}

test('GET sends the cookie and no CSRF token', async () => {
  const { fetchImpl, calls } = fakeServer(() => ({ body: { data: { hello: 1 } } }));
  const api = createApi({ fetchImpl });
  assert.deepEqual(await api.get('/x'), { hello: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.credentials, 'include');
  assert.equal(calls[0].init.headers['X-CSRF-Token'], undefined);
});

test('POST fetches a CSRF token once and reuses it', async () => {
  const { fetchImpl, calls } = fakeServer(({ url }) =>
    url.endsWith('/auth/csrf') ? { body: { data: { csrfToken: 'tok1' } } } : { body: { data: { ok: true } } });
  const api = createApi({ fetchImpl });
  await api.post('/a', { x: 1 });
  await api.post('/b', { y: 2 });
  assert.deepEqual(calls.map((c) => c.url), ['/api/v1/auth/csrf', '/api/v1/a', '/api/v1/b']);
  assert.equal(calls[1].init.headers['X-CSRF-Token'], 'tok1');
  assert.equal(calls[2].init.headers['X-CSRF-Token'], 'tok1');
  assert.equal(calls[1].init.body, JSON.stringify({ x: 1 }));
});

test('an expired token is replaced and the request retried once', async () => {
  let issued = 0;
  const { fetchImpl, calls } = fakeServer(({ url, init }) => {
    if (url.endsWith('/auth/csrf')) { issued += 1; return { body: { data: { csrfToken: `tok${issued}` } } }; }
    if (init.headers['X-CSRF-Token'] === 'tok1') return { status: 403, body: { error: { code: 'csrf_failed', message: 'expired' } } };
    return { body: { data: { done: true } } };
  });
  const api = createApi({ fetchImpl });
  assert.deepEqual(await api.post('/thing', {}), { done: true });
  assert.equal(issued, 2);
  assert.equal(calls.filter((c) => c.url === '/api/v1/thing').length, 2);
});

test('a login response rotates the stored token', async () => {
  const { fetchImpl, calls } = fakeServer(({ url }) => {
    if (url.endsWith('/auth/csrf')) return { body: { data: { csrfToken: 'old' } } };
    if (url.endsWith('/auth/login')) return { body: { data: { user: {}, csrfToken: 'new' } } };
    return { body: { data: null } };
  });
  const api = createApi({ fetchImpl });
  await api.post('/auth/login', {});
  await api.post('/next', {});
  assert.equal(calls.at(-1).init.headers['X-CSRF-Token'], 'new');
});

test('errors become ApiError with code, message, fields and requestId', async () => {
  const { fetchImpl } = fakeServer(() => ({
    status: 422,
    body: { error: { code: 'validation_failed', message: 'Check the fields.', fields: { email: 'Enter a valid email address.' }, requestId: 'r1' } },
  }));
  const api = createApi({ fetchImpl });
  await assert.rejects(api.get('/bad'), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 422);
    assert.equal(err.code, 'validation_failed');
    assert.deepEqual(err.fields, { email: 'Enter a valid email address.' });
    assert.equal(err.requestId, 'r1');
    return true;
  });
});

test('network failures and non-JSON errors get plain messages', async () => {
  const down = createApi({ fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(down.get('/x'), (err) => err.code === 'network_error' && /connection/.test(err.message));
  const html = createApi({ fetchImpl: async () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } }) });
  await assert.rejects(html.get('/x'), (err) => err.status === 502 && err.code === 'server_error');
});

test('204 responses give null', async () => {
  const { fetchImpl } = fakeServer(({ url }) =>
    url.endsWith('/auth/csrf') ? { body: { data: { csrfToken: 't' } } } : { status: 204 });
  const api = createApi({ fetchImpl });
  assert.equal(await api.post('/auth/logout'), null);
});

test('list() returns the data and the paging details', async () => {
  const { fetchImpl, calls } = fakeServer(() => ({ body: { data: [{ id: 'a' }], meta: { nextCursor: 'abc' } } }));
  const api = createApi({ fetchImpl });
  assert.deepEqual(await api.list('/products?limit=1'), { data: [{ id: 'a' }], meta: { nextCursor: 'abc' } });
  assert.equal(calls[0].init.headers['X-CSRF-Token'], undefined);
});
