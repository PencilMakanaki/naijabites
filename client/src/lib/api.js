// One place for every call to the server. It sends the cookie, adds the CSRF token to changes,
// and turns every failure into the same ApiError shape.

export class ApiError extends Error {
  constructor({ status, code, message, fields, requestId }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.requestId = requestId;
  }
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function createApi({ fetchImpl = (...args) => fetch(...args), baseUrl = '/api/v1' } = {}) {
  let csrfToken = null;
  let csrfPromise = null;

  async function raw(method, path, body, token, binary) {
    const headers = { Accept: 'application/json', ...(binary?.headers ?? {}) };
    if (binary) headers['Content-Type'] = binary.contentType;
    else if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers['X-CSRF-Token'] = token;
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        credentials: 'include',
        body: binary ? binary.body : body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError({ status: 0, code: 'network_error', message: 'Could not reach NaijaBites. Check your connection and try again.' });
    }
    if (response.status === 204) return { status: 204, json: null };
    let json = null;
    try { json = await response.json(); } catch { /* no JSON body */ }
    if (!response.ok) {
      const e = json?.error ?? {};
      throw new ApiError({
        status: response.status,
        code: e.code ?? 'server_error',
        message: e.message ?? 'Something went wrong. Please try again.',
        fields: e.fields,
        requestId: e.requestId,
      });
    }
    return { status: response.status, json };
  }

  async function ensureCsrf(force = false) {
    if (csrfToken && !force) return csrfToken;
    csrfPromise ??= raw('GET', '/auth/csrf')
      .then(({ json }) => { csrfToken = json.data.csrfToken; return csrfToken; })
      .finally(() => { csrfPromise = null; });
    return csrfPromise;
  }

  async function request(method, path, body, binary) {
    if (!UNSAFE.has(method)) return (await raw(method, path)).json?.data ?? null;
    let token = await ensureCsrf();
    try {
      const result = await raw(method, path, body, token, binary);
      return pickToken(result);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'csrf_failed') {
        token = await ensureCsrf(true); // the token expired: fetch a fresh one and try once more
        return pickToken(await raw(method, path, body, token, binary));
      }
      throw err;
    }
  }

  function pickToken(result) {
    const data = result.json?.data ?? null;
    if (data && typeof data.csrfToken === 'string') csrfToken = data.csrfToken; // login rotates the token
    return data;
  }

  /** A list: returns { data, meta } so the caller can read paging details such as meta.nextCursor. */
  async function list(path) {
    const { json } = await raw('GET', path);
    return { data: json?.data ?? [], meta: json?.meta ?? {} };
  }

  return {
    get: (path) => request('GET', path),
    list,
    post: (path, body) => request('POST', path, body ?? {}),
    put: (path, body) => request('PUT', path, body ?? {}),
    patch: (path, body) => request('PATCH', path, body ?? {}),
    /** Sends a file as the request body (for example a PDF or photo). */
    upload: (path, file, headers = {}) => request('PUT', path, undefined, { body: file, contentType: file.type, headers }),
    delete: (path) => request('DELETE', path),
    forgetCsrf: () => { csrfToken = null; },
  };
}

export const api = createApi();
