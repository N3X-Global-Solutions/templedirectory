const CSRF_HEADERS = Object.freeze({ 'X-Requested-With': 'temple-directory' });

export class ApiError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function request(method, path, body) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? CSRF_HEADERS : { ...CSRF_HEADERS, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check the connection and try again.', 0);
  }

  const payload = await response.json().catch(() => null);
  if (response.status === 401 && !path.startsWith('/auth/')) {
    window.dispatchEvent(new CustomEvent('auth:expired'));
  }
  if (!response.ok || !payload?.success) {
    throw new ApiError(payload?.error ?? `Request failed (${response.status})`, response.status, payload?.details ?? null);
  }
  return { data: payload.data, meta: payload.meta ?? null };
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  put: (path, body = {}) => request('PUT', path, body),
  delete: (path) => request('DELETE', path),
};

function filenameFrom(response, fallback) {
  const header = response.headers.get('content-disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(header);
  return match ? match[1] : fallback;
}

/** Fetches a file (CSV / backup) and hands it to the browser as a download. */
export async function downloadFile(path, { method = 'GET', body, fallbackName = 'download' } = {}) {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? CSRF_HEADERS : { ...CSRF_HEADERS, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(payload?.error ?? `Download failed (${response.status})`, response.status);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filenameFrom(response, fallbackName);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
