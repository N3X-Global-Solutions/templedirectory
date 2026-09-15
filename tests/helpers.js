import { openDatabase } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { ensureDefaultUsers } from '../src/auth/users.js';

export const ADMIN = { username: 'admin', password: 'admin-pass-123' };
export const VIEWER = { username: 'viewer', password: 'viewer-pass-123' };

const silentLogger = { error: () => {}, info: () => {} };

export async function startTestServer(envOverrides = {}) {
  const config = loadConfig({
    DB_PATH: ':memory:',
    ADMIN_PASSWORD: ADMIN.password,
    VIEWER_PASSWORD: VIEWER.password,
    TEMPLE_NAME: 'Test Temple',
    ...envOverrides,
  });
  const db = openDatabase(':memory:');
  const { app, users } = createApp({ db, config: { ...config, dbPath: ':memory:' }, logger: silentLogger });
  ensureDefaultUsers(users, config);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    baseUrl,
    db,
    client: () => createClient(baseUrl),
    async close() {
      await new Promise((resolve) => server.close(resolve));
      db.close();
    },
  };
}

export function createClient(baseUrl) {
  let cookie = '';

  async function request(method, path, { body, headers = {}, csrf = true } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(csrf ? { 'X-Requested-With': 'temple-directory' } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const type = response.headers.get('content-type') ?? '';
    const payload = type.includes('application/json') ? await response.json() : await response.text();
    return { status: response.status, headers: response.headers, body: payload };
  }

  return {
    get: (path, options) => request('GET', path, options),
    post: (path, body, options) => request('POST', path, { ...options, body }),
    put: (path, body, options) => request('PUT', path, { ...options, body }),
    delete: (path, options) => request('DELETE', path, options),
    async login(account) {
      const result = await request('POST', '/api/auth/login', { body: account });
      if (result.status !== 200) throw new Error(`login failed: ${JSON.stringify(result.body)}`);
      return result;
    },
  };
}

export function sampleDevotee(overrides = {}) {
  return {
    name: 'Murugan Subramanian',
    father_name: 'Subramanian',
    gender: 'Male',
    phone: '98765 43210',
    address: '12, North Car Street\nNear Big Temple',
    city: 'Thanjavur',
    state: 'Tamil Nadu',
    pincode: '613001',
    raasi: 'Mesham',
    natchathram: 'Bharani',
    caste: 'Vellalar',
    gothram: 'Kashyapa',
    member_type: 'Donor',
    family_members: [
      { name: 'Valli Murugan', relation: 'Wife', raasi: 'Kanni', natchathram: 'Hastham' },
      { name: 'Karthik Murugan', relation: 'Son', raasi: '', natchathram: '' },
    ],
    donations: [{ donated_on: '2026-01-14', amount: '5001', purpose: 'Annadhanam', mode: 'Cash', receipt_no: 'R-101' }],
    ...overrides,
  };
}
