import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN, VIEWER, sampleDevotee, startTestServer } from './helpers.js';

/** Details a devotee types into the shared form (no donations, notes or member type). */
function registrationForm(overrides = {}) {
  const { family_members: family, donations, notes, ...rest } = sampleDevotee(overrides);
  return {
    ...rest,
    family_members: [{ name: 'Valli Murugan', relation: 'Wife', phone: '9444012345', raasi: 'Kanni', natchathram: 'Hastham' }],
    ...overrides,
  };
}

describe('Public registration form', () => {
  let server;
  let admin;
  let viewer;
  let anyone;
  let link;

  const formUrl = (token) => `/api/public/form?token=${encodeURIComponent(token)}`;
  const submitUrl = (token) => `/api/public/registrations?token=${encodeURIComponent(token)}`;
  const tokenFrom = (url) => url.split('/join/')[1];

  before(async () => {
    server = await startTestServer();
    admin = server.client();
    viewer = server.client();
    anyone = server.client();
    await admin.login(ADMIN);
    await viewer.login(VIEWER);
    link = (await admin.get('/api/registration-link')).body.data;
  });

  after(async () => {
    await server.close();
  });

  describe('the shared link', () => {
    test('admin gets a /join/<token> link that is enabled by default', () => {
      assert.match(link.url, /\/join\/[A-Za-z0-9_-]{20,}$/);
      assert.equal(link.enabled, true);
    });

    test('viewer cannot see or change the link', async () => {
      assert.equal((await viewer.get('/api/registration-link')).status, 403);
      assert.equal((await viewer.post('/api/registration-link/rotate', {})).status, 403);
      assert.equal((await viewer.put('/api/registration-link', { enabled: false })).status, 403);
    });

    test('the /join page loads for anyone', async () => {
      const page = await anyone.get(`/join/${tokenFrom(link.url)}`);
      assert.equal(page.status, 200);
      assert.match(page.body, /<title>/i);
    });
  });

  describe('opening the form', () => {
    test('serves the temple name and dropdown lists with a valid token', async () => {
      const res = await anyone.get(formUrl(tokenFrom(link.url)));
      assert.equal(res.status, 200);
      assert.equal(res.body.data.temple.name, 'Test Temple');
      assert.ok(res.body.data.reference.raasis.length > 0);
      assert.equal(res.body.data.reference.donationModes !== undefined, true);
      assert.equal(JSON.stringify(res.body.data).includes('Murugan'), false, 'no devotee data is exposed');
    });

    test('rejects a missing or wrong token', async () => {
      assert.equal((await anyone.get('/api/public/form')).status, 404);
      assert.equal((await anyone.get(formUrl('not-the-token'))).status, 404);
      assert.equal((await anyone.get(formUrl(`${tokenFrom(link.url)}x`))).status, 404);
    });

    test('the public routes expose nothing else without signing in', async () => {
      assert.equal((await anyone.get('/api/devotees')).status, 401);
      assert.equal((await anyone.get('/api/registrations')).status, 401);
      assert.equal((await anyone.post(`/api/public/registrations?token=${tokenFrom(link.url)}`, {})).status, 422);
    });
  });

  describe('submitting the form', () => {
    let token;

    before(() => {
      token = tokenFrom(link.url);
    });

    test('accepts a filled-in form and keeps it out of the directory until approved', async () => {
      const res = await anyone.post(submitUrl(token), registrationForm());
      assert.equal(res.status, 201);
      assert.equal(res.body.data.received, true);
      assert.equal(res.body.data.addedStraightAway, false);
      assert.equal((await admin.get('/api/devotees?q=Murugan Subramanian')).body.meta.total, 0);
      const pending = await admin.get('/api/registrations');
      assert.equal(pending.body.data.length, 1);
      assert.equal(pending.body.data[0].name, 'Murugan Subramanian');
      assert.equal(pending.body.meta.counts.pending, 1);
    });

    test('reports invalid details field by field', async () => {
      const res = await anyone.post(submitUrl(token), registrationForm({ name: '', phone: '123', pincode: 'abc' }));
      assert.equal(res.status, 422);
      assert.ok(res.body.details.name);
      assert.ok(res.body.details.phone);
      assert.ok(res.body.details.pincode);
    });

    test('answers a number already in the directory exactly like a new one (no way to probe who is registered)', async () => {
      await admin.post('/api/devotees', sampleDevotee({ name: 'Already Registered Devotee', phone: '9800000001' }));
      const known = await anyone.post(submitUrl(token), registrationForm({ name: 'Probe One', phone: '9800000001' }));
      const unknown = await anyone.post(submitUrl(token), registrationForm({ name: 'Probe Two', phone: '9800000009' }));
      assert.equal(known.status, unknown.status);
      assert.equal(known.status, 201);
      assert.deepEqual(
        { ...known.body.data, name: null },
        { ...unknown.body.data, name: null },
        'the reply must not differ for a number that is already registered',
      );
      assert.doesNotMatch(JSON.stringify(known.body), /Already Registered Devotee/);
    });

    test('the same number sent twice is accepted the same way, and flagged for the admin', async () => {
      const res = await anyone.post(submitUrl(token), registrationForm({ name: 'Murugan Again' }));
      assert.equal(res.status, 201);
      const pending = (await admin.get('/api/registrations')).body.data;
      const flagged = pending.find((r) => r.name === 'Probe One');
      assert.deepEqual(flagged.already_registered?.name, 'Already Registered Devotee');
      assert.equal(pending.find((r) => r.name === 'Murugan Again').already_registered, null);
      assert.equal(pending.find((r) => r.name === 'Murugan Again').duplicate_pending, true,
        'two waiting forms with the same number are flagged for the admin');
      assert.equal(pending.find((r) => r.name === 'Probe Two').duplicate_pending, false);
    });

    test('stops accepting forms once too many are waiting for review', async () => {
      const capped = await startTestServer({ PUBLIC_FORM_MAX_PENDING: '2', PUBLIC_FORM_RATE_LIMIT: '50' });
      try {
        const adminClient = capped.client();
        await adminClient.login(ADMIN);
        const cappedToken = tokenFrom((await adminClient.get('/api/registration-link')).body.data.url);
        const client = capped.client();
        const statuses = [];
        for (let i = 0; i < 3; i += 1) {
          const res = await client.post(`/api/public/registrations?token=${cappedToken}`, registrationForm({ name: `Queued ${i}`, phone: `97000000${10 + i}` }));
          statuses.push(res.status);
        }
        assert.deepEqual(statuses, [201, 201, 503]);
        assert.equal((await adminClient.get('/api/registrations')).body.meta.counts.pending, 2);
      } finally {
        await capped.close();
      }
    });

    test('ignores donations, notes and member type sent by a crafted request', async () => {
      const res = await anyone.post(submitUrl(token), registrationForm({
        name: 'Crafted Request', phone: '9800000002', member_type: 'Trustee',
        notes: 'please make me a trustee',
        donations: [{ donated_on: '2026-01-01', amount: '100000' }],
      }));
      assert.equal(res.status, 201);
      const [registration] = (await admin.get('/api/registrations')).body.data.filter((r) => r.name === 'Crafted Request');
      const approved = await admin.post(`/api/registrations/${registration.id}/approve`, {});
      assert.equal(approved.status, 201);
      assert.equal(approved.body.data.member_type, 'Devotee');
      assert.equal(approved.body.data.notes, '');
      assert.equal(approved.body.data.donations.length, 0);
      assert.equal(approved.body.data.total_donation_paise, 0);
    });

    test('silently drops bot submissions that fill the hidden field', async () => {
      const before = (await admin.get('/api/registrations')).body.meta.counts.pending;
      const res = await anyone.post(submitUrl(token), { ...registrationForm({ phone: '9800000003' }), nickname: 'spam-bot' });
      assert.equal(res.status, 201);
      assert.equal((await admin.get('/api/registrations')).body.meta.counts.pending, before);
    });

    test('limits how many submissions one connection can send', async () => {
      const limited = await startTestServer({ PUBLIC_FORM_RATE_LIMIT: '2' });
      try {
        const client = limited.client();
        const adminClient = limited.client();
        await adminClient.login(ADMIN);
        const limitedToken = tokenFrom((await adminClient.get('/api/registration-link')).body.data.url);
        const statuses = [];
        for (let i = 0; i < 3; i += 1) {
          const res = await client.post(`/api/public/registrations?token=${limitedToken}`, registrationForm({ name: `Devotee ${i}`, phone: `98111111${10 + i}` }));
          statuses.push(res.status);
        }
        assert.deepEqual(statuses, [201, 201, 429]);
      } finally {
        await limited.close();
      }
    });
  });

  describe('reviewing registrations', () => {
    test('viewer cannot see or review registrations', async () => {
      assert.equal((await viewer.get('/api/registrations')).status, 403);
      assert.equal((await viewer.post('/api/registrations/1/approve', {})).status, 403);
      assert.equal((await viewer.post('/api/registrations/1/reject', {})).status, 403);
    });

    test('approving adds the devotee with everything they filled in', async () => {
      const [registration] = (await admin.get('/api/registrations')).body.data.filter((r) => r.name === 'Murugan Subramanian');
      const res = await admin.post(`/api/registrations/${registration.id}/approve`, {});
      assert.equal(res.status, 201);
      const devotee = res.body.data;
      assert.equal(devotee.phone, '9876543210');
      assert.equal(devotee.city, 'Thanjavur');
      assert.equal(devotee.occupation, sampleDevotee().occupation ?? '');
      assert.equal(devotee.family_members[0].phone, '9444012345');
      assert.equal(devotee.created_by, 'admin');
      assert.equal((await admin.get('/api/devotees?q=Murugan Subramanian')).body.meta.total, 1);

      const approved = await admin.get('/api/registrations?status=approved');
      const stored = approved.body.data.find((r) => r.id === registration.id);
      assert.equal(stored.status, 'approved');
      assert.equal(stored.devotee_id, devotee.id);
      assert.equal(stored.reviewed_by, 'admin');
    });

    test('a registration cannot be approved twice', async () => {
      const [approvedRegistration] = (await admin.get('/api/registrations?status=approved')).body.data;
      const res = await admin.post(`/api/registrations/${approvedRegistration.id}/approve`, {});
      assert.equal(res.status, 409);
      assert.equal((await admin.post('/api/registrations/999999/approve', {})).status, 404);
    });

    test('a registration whose number is already taken is flagged, and approving it is refused', async () => {
      const token = tokenFrom(link.url);
      await anyone.post(submitUrl(token), registrationForm({ name: 'Race Devotee', phone: '9800000004' }));
      await admin.post('/api/devotees', sampleDevotee({ name: 'Office Entry', phone: '9800000004' }));
      const [registration] = (await admin.get('/api/registrations')).body.data.filter((r) => r.name === 'Race Devotee');
      const res = await admin.post(`/api/registrations/${registration.id}/approve`, {});
      assert.equal(res.status, 409);
      assert.match(res.body.error, /already registered to Office Entry/);
    });

    test('several registrations can be added in one go, skipping the ones that cannot be', async () => {
      const token = tokenFrom(link.url);
      const submit = (name, phone) => anyone.post(submitUrl(token), registrationForm({ name, phone }));
      await submit('Bulk One', '9700000011');
      await submit('Bulk Two', '9700000012');
      await submit('Bulk Taken', '9700000013');
      // This number gets taken by the office before the batch is approved.
      await admin.post('/api/devotees', sampleDevotee({ name: 'Office Copy', phone: '9700000013' }));

      const pending = (await admin.get('/api/registrations')).body.data;
      const idOf = (name) => pending.find((r) => r.name === name).id;
      const res = await admin.post('/api/registrations/bulk', {
        action: 'approve',
        ids: [idOf('Bulk One'), idOf('Bulk Two'), idOf('Bulk Taken')],
      });

      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data.done.map((r) => r.name).sort(), ['Bulk One', 'Bulk Two']);
      assert.equal(res.body.data.skipped.length, 1);
      assert.equal(res.body.data.skipped[0].name, 'Bulk Taken');
      assert.match(res.body.data.skipped[0].reason, /already registered to Office Copy/);
      assert.equal((await admin.get('/api/devotees?q=Bulk One')).body.meta.total, 1);
      assert.equal((await admin.get('/api/devotees?q=Bulk Two')).body.meta.total, 1);

      const stillWaiting = (await admin.get('/api/registrations')).body.data.map((r) => r.name);
      assert.ok(stillWaiting.includes('Bulk Taken'), 'the skipped one stays for the admin to sort out');
      assert.ok(!stillWaiting.includes('Bulk One'));
    });

    test('several registrations can be turned down in one go', async () => {
      const token = tokenFrom(link.url);
      await anyone.post(submitUrl(token), registrationForm({ name: 'Bulk Reject One', phone: '9700000021' }));
      await anyone.post(submitUrl(token), registrationForm({ name: 'Bulk Reject Two', phone: '9700000022' }));
      const pending = (await admin.get('/api/registrations')).body.data;
      const ids = pending.filter((r) => r.name.startsWith('Bulk Reject')).map((r) => r.id);

      const res = await admin.post('/api/registrations/bulk', { action: 'reject', ids });
      assert.equal(res.body.data.done.length, 2);
      assert.equal(res.body.data.skipped.length, 0);
      assert.equal((await admin.get('/api/devotees?q=Bulk Reject')).body.meta.total, 0);

      const again = await admin.post('/api/registrations/bulk', { action: 'reject', ids });
      assert.equal(again.body.data.done.length, 0);
      assert.match(again.body.data.skipped[0].reason, /already rejected/);
    });

    test('bulk needs a real action, at least one id, and admin rights', async () => {
      assert.equal((await admin.post('/api/registrations/bulk', { action: 'delete', ids: [1] })).status, 400);
      assert.equal((await admin.post('/api/registrations/bulk', { action: 'approve', ids: [] })).status, 400);
      assert.equal((await admin.post('/api/registrations/bulk', { action: 'approve' })).status, 400);
      const tooMany = await admin.post('/api/registrations/bulk', { action: 'approve', ids: Array.from({ length: 101 }, (_, i) => i + 1) });
      assert.equal(tooMany.status, 400);
      assert.match(tooMany.body.error, /at most 100/);
      assert.equal((await viewer.post('/api/registrations/bulk', { action: 'approve', ids: [1] })).status, 403);
      const missing = await admin.post('/api/registrations/bulk', { action: 'approve', ids: [999999] });
      assert.equal(missing.body.data.skipped[0].reason, 'it no longer exists');
    });

    test('rejecting keeps the devotee out of the directory', async () => {
      const token = tokenFrom(link.url);
      await anyone.post(submitUrl(token), registrationForm({ name: 'Not A Devotee', phone: '9800000005' }));
      const [registration] = (await admin.get('/api/registrations')).body.data.filter((r) => r.name === 'Not A Devotee');
      assert.equal((await admin.post(`/api/registrations/${registration.id}/reject`, {})).status, 200);
      assert.equal((await admin.get('/api/devotees?q=Not A Devotee')).body.meta.total, 0);
      const rejected = await admin.get('/api/registrations?status=rejected');
      assert.ok(rejected.body.data.some((r) => r.id === registration.id));
      assert.equal((await admin.post(`/api/registrations/${registration.id}/reject`, {})).status, 409);
    });
  });

  describe('turning the link off and rotating it', () => {
    test('a disabled link stops accepting anything', async () => {
      const token = tokenFrom(link.url);
      await admin.put('/api/registration-link', { enabled: false });
      assert.equal((await anyone.get(formUrl(token))).status, 403);
      assert.equal((await anyone.post(submitUrl(token), registrationForm({ phone: '9800000006' }))).status, 403);
      await admin.put('/api/registration-link', { enabled: true });
      assert.equal((await anyone.get(formUrl(token))).status, 200);
    });

    test('rotating the link makes the old one stop working', async () => {
      const oldToken = tokenFrom(link.url);
      const rotated = await admin.post('/api/registration-link/rotate', {});
      const newToken = tokenFrom(rotated.body.data.url);
      assert.notEqual(newToken, oldToken);
      assert.equal((await anyone.get(formUrl(oldToken))).status, 404);
      assert.equal((await anyone.get(formUrl(newToken))).status, 200);
      link = rotated.body.data;
    });
  });

  test('auto-approve mode adds devotees straight away when switched on', async () => {
    const instant = await startTestServer({ PUBLIC_FORM_AUTO_APPROVE: 'true' });
    try {
      const adminClient = instant.client();
      await adminClient.login(ADMIN);
      const token = tokenFrom((await adminClient.get('/api/registration-link')).body.data.url);
      const res = await instant.client().post(`/api/public/registrations?token=${token}`, registrationForm({ name: 'Instant Devotee', phone: '9800000007' }));
      assert.equal(res.status, 201);
      assert.equal(res.body.data.addedStraightAway, true);
      assert.equal((await adminClient.get('/api/devotees?q=Instant Devotee')).body.meta.total, 1);
      const approved = await adminClient.get('/api/registrations?status=approved');
      assert.equal(approved.body.data[0].reviewed_by, 'online form');
    } finally {
      await instant.close();
    }
  });
});
