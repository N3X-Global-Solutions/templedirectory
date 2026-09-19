import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN, VIEWER, sampleDevotee, startTestServer } from './helpers.js';

describe('Temple directory API', () => {
  let server;
  let admin;
  let viewer;

  before(async () => {
    server = await startTestServer();
    admin = server.client();
    viewer = server.client();
    await admin.login(ADMIN);
    await viewer.login(VIEWER);
  });

  after(async () => {
    await server.close();
  });

  describe('authentication', () => {
    test('rejects unauthenticated API access', async () => {
      const res = await server.client().get('/api/devotees');
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    test('health endpoint works without signing in and reveals nothing else', async () => {
      const res = await server.client().get('/api/health');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data, { status: 'ok' });
    });

    test('serves branding without signing in', async () => {
      const res = await server.client().get('/api/auth/branding');
      assert.equal(res.body.data.name, 'Test Temple');
    });

    test('rejects wrong password and sets a strict HttpOnly cookie on success', async () => {
      const client = server.client();
      const bad = await client.post('/api/auth/login', { username: 'admin', password: 'nope-nope' });
      assert.equal(bad.status, 401);
      const good = await client.post('/api/auth/login', ADMIN);
      assert.equal(good.status, 200);
      const cookie = good.headers.get('set-cookie');
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Strict/i);
      assert.equal(good.body.data.permissions.canEdit, true);
    });

    test('blocks state-changing requests without the CSRF header', async () => {
      const res = await admin.post('/api/devotees', sampleDevotee({ phone: '9000000001' }), { csrf: false });
      assert.equal(res.status, 403);
    });

    test('logout revokes the session', async () => {
      const client = server.client();
      await client.login(VIEWER);
      assert.equal((await client.get('/api/auth/session')).status, 200);
      await client.post('/api/auth/logout');
      assert.equal((await client.get('/api/auth/session')).status, 401);
    });

    test('rate-limits repeated failed logins', async () => {
      const limited = await startTestServer();
      try {
        const client = limited.client();
        for (let i = 0; i < 8; i += 1) await client.post('/api/auth/login', { username: 'admin', password: 'wrong-pass' });
        const res = await client.post('/api/auth/login', ADMIN);
        assert.equal(res.status, 429);
      } finally {
        await limited.close();
      }
    });
  });

  describe('devotee CRUD', () => {
    let createdId;

    test('admin creates a devotee with family and donations', async () => {
      const res = await admin.post('/api/devotees', sampleDevotee());
      assert.equal(res.status, 201);
      createdId = res.body.data.id;
      assert.equal(res.body.data.phone, '9876543210');
      assert.equal(res.body.data.family_members.length, 2);
      assert.equal(res.body.data.total_donation_paise, 500100);
      assert.equal(res.body.data.created_by, 'admin');
    });

    test('duplicate phone numbers (in any format) are rejected with the existing owner', async () => {
      const res = await admin.post('/api/devotees', sampleDevotee({ name: 'Someone Else', phone: '+91 98765 43210' }));
      assert.equal(res.status, 409);
      assert.match(res.body.error, /already registered to Murugan Subramanian/);
      assert.equal(res.body.details.existingId, createdId);
    });

    test('phone-check reports availability and ignores the record being edited', async () => {
      const taken = await admin.get('/api/devotees/phone-check?phone=09876543210');
      assert.equal(taken.body.data.available, false);
      const self = await admin.get(`/api/devotees/phone-check?phone=9876543210&excludeId=${createdId}`);
      assert.equal(self.body.data.available, true);
      const invalid = await admin.get('/api/devotees/phone-check?phone=12');
      assert.equal(invalid.status, 400);
    });

    test('validation errors come back per field', async () => {
      const res = await admin.post('/api/devotees', sampleDevotee({ phone: '', pincode: 'abc' }));
      assert.equal(res.status, 422);
      assert.ok(res.body.details.phone);
      assert.ok(res.body.details.pincode);
    });

    test('admin updates a devotee and replaces family members', async () => {
      const res = await admin.put(`/api/devotees/${createdId}`, sampleDevotee({
        city: 'Kumbakonam',
        family_members: [{ name: 'Valli Murugan', relation: 'Wife' }],
        donations: [],
      }));
      assert.equal(res.status, 200);
      assert.equal(res.body.data.city, 'Kumbakonam');
      assert.equal(res.body.data.family_members.length, 1);
      assert.equal(res.body.data.total_donation_paise, 0);
    });

    test('a save based on an outdated version is rejected instead of overwriting', async () => {
      const current = (await admin.get(`/api/devotees/${createdId}`)).body.data;
      const first = await admin.put(`/api/devotees/${createdId}`, sampleDevotee({ ...current, donations: [], notes: 'first device', version: current.version }));
      assert.equal(first.status, 200);
      assert.equal(first.body.data.version, current.version + 1);

      const stale = await admin.put(`/api/devotees/${createdId}`, sampleDevotee({ ...current, donations: [], notes: 'second device', version: current.version }));
      assert.equal(stale.status, 409);
      assert.equal(stale.body.details.staleVersion, true);
      assert.equal((await admin.get(`/api/devotees/${createdId}`)).body.data.notes, 'first device');
    });

    test('updating to another devotee\'s phone is rejected', async () => {
      const other = await admin.post('/api/devotees', sampleDevotee({ name: 'Lakshmi', phone: '9123456780', family_members: [], donations: [] }));
      const res = await admin.put(`/api/devotees/${other.body.data.id}`, sampleDevotee({ name: 'Lakshmi', phone: '9876543210' }));
      assert.equal(res.status, 409);
    });

    test('viewer can read but cannot create, update, delete or phone-check', async () => {
      assert.equal((await viewer.get(`/api/devotees/${createdId}`)).status, 200);
      assert.equal((await viewer.post('/api/devotees', sampleDevotee({ phone: '9000000002' }))).status, 403);
      assert.equal((await viewer.put(`/api/devotees/${createdId}`, sampleDevotee())).status, 403);
      assert.equal((await viewer.delete(`/api/devotees/${createdId}`)).status, 403);
      assert.equal((await viewer.get('/api/devotees/phone-check?phone=9876543210')).status, 403);
    });

    test('unknown or malformed ids return 404', async () => {
      assert.equal((await admin.get('/api/devotees/999999')).status, 404);
      assert.equal((await admin.get('/api/devotees/abc')).status, 404);
      assert.equal((await admin.put('/api/devotees/999999', sampleDevotee({ phone: '9000000003' }))).status, 404);
    });

    test('admin deletes a devotee', async () => {
      const temp = await admin.post('/api/devotees', sampleDevotee({ name: 'Temp', phone: '9000000004' }));
      const id = temp.body.data.id;
      assert.equal((await admin.delete(`/api/devotees/${id}`)).status, 200);
      assert.equal((await admin.get(`/api/devotees/${id}`)).status, 404);
      assert.equal((await admin.delete(`/api/devotees/${id}`)).status, 404);
    });
  });

  describe('search, filter, sort and reports', () => {
    before(async () => {
      const people = [
        { name: 'Anand Raman', phone: '9811111111', city: 'Madurai', raasi: 'Simmam', natchathram: 'Magam', gothram: 'Bharadwaja', gender: 'Male',
          occupation: 'Teacher', hundiyal_wanted: true, japa_homa_yearly: true, annadhanam_offer: false, dob: '2002-02-17',
          family_members: [{ name: 'Priya Anand', relation: 'Wife', phone: '+91 94440 12345', raasi: 'Thulam', natchathram: 'Swathi' }], donations: [] },
        { name: 'Bhavani Selvam', phone: '9822222222', city: 'Chennai', raasi: 'Kadagam', natchathram: 'Poosam', gender: 'Female',
          occupation: 'Farmer', hundiyal_wanted: 'no', japa_homa_yearly: 'no', annadhanam_offer: 'yes',
          address: '9, Mount Road', pincode: '600002', family_members: [], donations: [{ donated_on: '2026-03-01', amount: '1001', mode: 'UPI' }] },
        { name: 'Chandran 100%_test', phone: '9833333333', city: 'madurai', raasi: 'Simmam', natchathram: 'Pooram', gender: 'Male',
          occupation: 'teacher', family_members: [], donations: [] },
      ];
      for (const person of people) {
        const res = await admin.post('/api/devotees', sampleDevotee(person));
        assert.equal(res.status, 201, JSON.stringify(res.body));
      }
    });

    test('searches by name, partial phone and family member name', async () => {
      assert.equal((await viewer.get('/api/devotees?q=bhavani')).body.meta.total, 1);
      assert.equal((await viewer.get('/api/devotees?q=98222')).body.data[0].name, 'Bhavani Selvam');
      assert.equal((await viewer.get('/api/devotees?q=Priya')).body.data[0].name, 'Anand Raman');
    });

    test('returns occupation, hundiyal choice (as a boolean) and family member phones', async () => {
      const [anand] = (await viewer.get('/api/devotees?q=Anand Raman')).body.data;
      assert.equal(anand.hundiyal_wanted, true);
      const record = (await viewer.get(`/api/devotees/${anand.id}`)).body.data;
      assert.equal(record.occupation, 'Teacher');
      assert.equal(record.hundiyal_wanted, true);
      assert.equal(record.family_members[0].phone, '9444012345');
      const [bhavani] = (await viewer.get('/api/devotees?q=Bhavani')).body.data;
      assert.equal(bhavani.hundiyal_wanted, false);
    });

    test('stores the two temple questions and filters by them', async () => {
      const [anand] = (await viewer.get('/api/devotees?q=Anand Raman')).body.data;
      assert.equal(anand.japa_homa_yearly, true);
      assert.equal(anand.annadhanam_offer, false);
      const record = (await viewer.get(`/api/devotees/${anand.id}`)).body.data;
      assert.equal(record.japa_homa_yearly, true);
      assert.equal(record.annadhanam_offer, false);

      const japa = (await viewer.get('/api/devotees?japaHoma=yes')).body;
      assert.deepEqual(japa.data.map((d) => d.name), ['Anand Raman']);
      const annadhanam = (await viewer.get('/api/devotees?annadhanam=yes')).body;
      assert.deepEqual(annadhanam.data.map((d) => d.name), ['Bhavani Selvam']);
      assert.ok((await viewer.get('/api/devotees?japaHoma=no')).body.data.every((d) => d.japa_homa_yearly === false));
      const both = (await viewer.get('/api/devotees?japaHoma=yes&annadhanam=yes')).body;
      assert.equal(both.meta.total, 0, 'the two filters narrow together');
      assert.equal((await viewer.get('/api/mailing?annadhanam=yes')).body.data.length, 1);
    });

    test('searches by family member phone and occupation', async () => {
      assert.equal((await viewer.get('/api/devotees?q=94440')).body.data[0].name, 'Anand Raman');
      assert.equal((await viewer.get('/api/devotees?q=teacher')).body.meta.total, 2);
    });

    test('filters by hundiyal wanted and occupation', async () => {
      const wanted = (await viewer.get('/api/devotees?hundiyal=yes')).body;
      assert.deepEqual(wanted.data.map((d) => d.name), ['Anand Raman']);
      const notWanted = (await viewer.get('/api/devotees?hundiyal=no')).body;
      assert.ok(notWanted.data.every((d) => d.hundiyal_wanted === false));
      assert.ok(notWanted.data.some((d) => d.name === 'Chandran 100%_test'), 'omitted choice counts as no');
      assert.equal((await viewer.get('/api/devotees?occupation=TEACHER')).body.meta.total, 2);
      const mailing = (await viewer.get('/api/mailing?hundiyal=yes')).body;
      assert.deepEqual(mailing.data.map((d) => d.name), ['Anand Raman']);
      const facets = (await viewer.get('/api/facets')).body.data;
      assert.equal(facets.occupations.filter((o) => o.toLowerCase() === 'teacher').length, 1);
    });

    test('treats LIKE wildcards in the query literally', async () => {
      const res = await viewer.get('/api/devotees?q=100%25_');
      assert.equal(res.body.meta.total, 1);
      assert.equal(res.body.data[0].name, 'Chandran 100%_test');
    });

    test('filters case-insensitively by city and exactly by raasi / donations', async () => {
      assert.equal((await viewer.get('/api/devotees?city=MADURAI')).body.meta.total, 2);
      assert.equal((await viewer.get('/api/devotees?raasi=Simmam&natchathram=Magam')).body.meta.total, 1);
      const donors = await viewer.get('/api/devotees?donations=yes');
      assert.ok(donors.body.data.every((d) => d.total_donation_paise > 0));
    });

    test('sorts and paginates', async () => {
      const desc = await viewer.get('/api/devotees?sort=name&dir=desc&pageSize=10');
      const names = desc.body.data.map((d) => d.name);
      assert.deepEqual(names, [...names].sort((a, b) => b.localeCompare(a, 'en', { sensitivity: 'base' })));
      const page = await viewer.get('/api/devotees?pageSize=10&page=99');
      assert.equal(page.body.data.length, 0);
      assert.equal(page.body.meta.page, 99);
    });

    test('stats and facets summarise the directory', async () => {
      const stats = (await viewer.get('/api/stats')).body.data;
      assert.ok(stats.devotees >= 4);
      assert.ok(stats.donors >= 1);
      const facets = (await viewer.get('/api/facets')).body.data;
      assert.equal(facets.cities.filter((c) => c.toLowerCase() === 'madurai').length, 1);
    });

    test('pooja lookup returns stars for the household', async () => {
      const res = await viewer.get('/api/pooja?q=Priya');
      assert.equal(res.status, 200);
      const [household] = res.body.data;
      assert.equal(household.raasi, 'Simmam');
      assert.equal(household.family_members[0].natchathram, 'Swathi');
      assert.equal(household.address, undefined, 'pooja lookup must not expose addresses');
      assert.equal((await viewer.get('/api/pooja?q=a')).status, 400);
    });

    test('pooja lookup finds a household by a family member phone and shows the Tamil birth month only', async () => {
      const [household] = (await viewer.get('/api/pooja?q=9444012345')).body.data;
      assert.equal(household.name, 'Anand Raman');
      assert.deepEqual(household.tamil_birth_month, { en: 'Maasi', ta: 'மாசி' });
      assert.equal(household.dob, undefined, 'full date of birth stays private');
      assert.equal(household.family_members[0].phone, undefined, 'family phones are not needed for pooja');
      const [bhavani] = (await viewer.get('/api/pooja?q=Bhavani')).body.data;
      assert.equal(typeof bhavani.tamil_birth_month.en, 'string');
      assert.equal(bhavani.dob, undefined);
    });

    test('mailing list returns addresses for selected ids or filters', async () => {
      const all = await viewer.get('/api/mailing?city=Chennai');
      assert.equal(all.body.meta.total, 1);
      const ids = all.body.data.map((d) => d.id).join(',');
      const selected = await viewer.get(`/api/mailing?ids=${ids}`);
      assert.equal(selected.body.data.length, 1);
      assert.equal((await viewer.get('/api/mailing?ids=abc')).body.data.length, 0);
    });

    test('mailing list and export accept every directory sort key', async () => {
      for (const sort of ['name', 'city', 'donation', 'updated']) {
        const res = await viewer.get(`/api/mailing?sort=${sort}&dir=desc`);
        assert.equal(res.status, 200, `sort=${sort}`);
      }
      const csv = await admin.post('/api/mailing/export', { criteria: { sort: 'donation', dir: 'desc' } });
      assert.equal(csv.status, 200);
    });

    test('mailing CSV export is admin-only by default', async () => {
      const denied = await viewer.post('/api/mailing/export', { criteria: {} });
      assert.equal(denied.status, 403);
      const res = await admin.post('/api/mailing/export', { criteria: { city: 'Madurai' } });
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-disposition'), /mailing-addresses-all/);
      assert.match(res.body, /Anand Raman/);
      assert.doesNotMatch(res.body, /Bhavani/);
    });

    test('full CSV export and database backup are admin-only', async () => {
      assert.equal((await viewer.get('/api/export/full')).status, 403);
      const csv = await admin.get('/api/export/full');
      assert.match(csv.body, /Priya Anand \(Wife, 9444012345\)/);
      assert.match(csv.body, /Occupation,Hundiyal Wanted,Japa Homa Yearly,Annadhanam on Amavasai/);
      assert.match(csv.body, /Anand Raman,.*Teacher,Yes,Yes,No/);
      assert.match(csv.body, /Anand Raman,.*Teacher,Yes/);
      assert.match(csv.body, /Maasi/, 'Tamil birthday column is included');
      assert.equal((await viewer.get('/api/backup')).status, 403);
      const backup = await admin.get('/api/backup');
      assert.equal(backup.status, 200);
      assert.match(backup.headers.get('content-disposition'), /temple-directory-backup/);
    });
  });

  describe('password management', () => {
    test('viewer cannot change passwords', async () => {
      assert.equal((await viewer.put('/api/auth/viewer-password', { newPassword: 'another-pass' })).status, 403);
    });

    test('admin must supply the current password and a strong new one', async () => {
      const wrong = await admin.put('/api/auth/password', { currentPassword: 'bad', newPassword: 'new-admin-pass' });
      assert.equal(wrong.status, 400);
      const weak = await admin.put('/api/auth/password', { currentPassword: ADMIN.password, newPassword: 'short' });
      assert.equal(weak.status, 422);
    });

    test('resetting the viewer password signs the viewer out', async () => {
      const client = server.client();
      await client.login(VIEWER);
      const res = await admin.put('/api/auth/viewer-password', { newPassword: 'fresh-viewer-pass' });
      assert.equal(res.status, 200);
      assert.equal((await client.get('/api/auth/session')).status, 401);
      await client.login({ username: 'viewer', password: 'fresh-viewer-pass' });
    });

    test('admin changes own password and keeps the current session', async () => {
      const res = await admin.put('/api/auth/password', { currentPassword: ADMIN.password, newPassword: 'brand-new-admin' });
      assert.equal(res.status, 200);
      assert.equal((await admin.get('/api/auth/session')).status, 200);
      await server.client().login({ username: 'admin', password: 'brand-new-admin' });
    });
  });

  test('general API requests are rate limited per client', async () => {
    const limited = await startTestServer({ API_RATE_LIMIT: '5' });
    try {
      const client = limited.client();
      const statuses = [];
      for (let i = 0; i < 7; i += 1) statuses.push((await client.get('/api/auth/branding')).status);
      assert.deepEqual(statuses.slice(0, 5), [200, 200, 200, 200, 200]);
      const blocked = await client.get('/api/auth/branding');
      assert.equal(blocked.status, 429);
      assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    } finally {
      await limited.close();
    }
  });

  test('exports and backups have a stricter limit', async () => {
    const limited = await startTestServer({ EXPORT_RATE_LIMIT: '2' });
    try {
      const client = limited.client();
      await client.login(ADMIN);
      assert.equal((await client.get('/api/export/full')).status, 200);
      assert.equal((await client.get('/api/backup')).status, 200);
      assert.equal((await client.post('/api/mailing/export', {})).status, 429);
      assert.equal((await client.get('/api/devotees')).status, 200, 'normal browsing is unaffected');
    } finally {
      await limited.close();
    }
  });

  test('HSTS is sent only when served over HTTPS', async () => {
    assert.equal((await server.client().get('/')).headers.get('strict-transport-security'), null);
    const secure = await startTestServer({ SECURE_COOKIES: 'true' });
    try {
      assert.match((await secure.client().get('/')).headers.get('strict-transport-security'), /max-age=\d+/);
    } finally {
      await secure.close();
    }
  });

  test('viewer export can be enabled via configuration', async () => {
    const open = await startTestServer({ VIEWER_CAN_EXPORT: 'true' });
    try {
      const client = open.client();
      const session = await client.login(VIEWER);
      assert.equal(session.body.data.permissions.canExport, true);
      assert.equal((await client.post('/api/mailing/export', {})).status, 200);
    } finally {
      await open.close();
    }
  });
});
