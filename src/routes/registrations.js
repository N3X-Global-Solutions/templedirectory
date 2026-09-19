import express from 'express';
import { HttpError, requireId, sendData } from '../http.js';
import { ROLES } from '../auth/users.js';
import { requireRole } from '../auth/middleware.js';
import { REGISTRATION_STATUSES } from '../repositories/registrations.js';
import { isPhoneConflict } from '../repositories/devotees.js';
import { parseIdList } from '../criteria.js';
import { validatePublicRegistration } from '../validation.js';

/** Most registrations one "add selected" press may handle. */
const MAX_BULK = 100;
const failure = (status, message, details = null) => ({ ok: false, status, message, details });

/** Full link a devotee opens, built from the address the admin is using. */
const linkFor = (req, token) => `${req.protocol}://${req.get('host')}/join/${token}`;

export function createRegistrationRouter({ settings, registrations, devotees }) {
  const router = express.Router();
  const adminOnly = requireRole(ROLES.ADMIN);

  const linkPayload = (req) => ({
    url: linkFor(req, settings.publicFormToken()),
    enabled: settings.isPublicFormEnabled(),
  });

  router.get('/registration-link', adminOnly, (req, res) => sendData(res, linkPayload(req)));

  router.post('/registration-link/rotate', adminOnly, (req, res) => {
    settings.rotatePublicFormToken();
    sendData(res, linkPayload(req));
  });

  router.put('/registration-link', adminOnly, (req, res) => {
    const { enabled } = req.body ?? {};
    if (typeof enabled !== 'boolean') throw new HttpError(400, 'enabled must be true or false');
    settings.setPublicFormEnabled(enabled);
    sendData(res, linkPayload(req));
  });

  router.get('/registrations', adminOnly, (req, res) => {
    const status = REGISTRATION_STATUSES.includes(req.query.status) ? req.query.status : 'pending';
    // The public form treats every submission alike; the admin is the one who sees
    // that a number already belongs to someone in the directory.
    const list = registrations.listByStatus(status).map((registration) => {
      if (registration.status !== 'pending') return { ...registration, already_registered: null, duplicate_pending: false };
      const existing = devotees.findByPhone(registration.phone);
      return {
        ...registration,
        already_registered: existing ? { id: existing.id, name: existing.name } : null,
        duplicate_pending: registrations.countPendingWithPhone(registration.phone) > 1,
      };
    });
    sendData(res, list, { status, counts: registrations.counts() });
  });

  router.get('/registrations/summary', adminOnly, (req, res) => sendData(res, registrations.counts()));

  /**
   * Adds one waiting registration to the directory. Used by the single Approve button
   * and by "add selected", so both apply exactly the same checks.
   * Returns { ok: true, devoteeId } or a failure with the message to show.
   */
  function addToDirectory(registration, username) {
    if (registration.status !== 'pending') return failure(409, `This registration was already ${registration.status}`);

    // Re-check the submitted details: they were stored as sent, and the phone may have been taken since.
    const { data, errors } = validatePublicRegistration(registration.details);
    if (errors) return failure(422, 'These details cannot be saved as they are. Please add this devotee by hand.', errors);
    const existing = devotees.findByPhone(data.phone);
    if (existing) return failure(409, `${data.phone} is already registered to ${existing.name}`, { existingId: existing.id });

    let devoteeId;
    try {
      devoteeId = devotees.create(data, username);
    } catch (error) {
      if (isPhoneConflict(error)) return failure(409, 'That phone number was registered a moment ago by someone else');
      throw error;
    }
    if (!registrations.review(registration.id, { status: 'approved', reviewer: username, devoteeId })) {
      return failure(409, 'Another admin reviewed this registration first');
    }
    return { ok: true, devoteeId };
  }

  router.post('/registrations/bulk', adminOnly, (req, res) => {
    const action = req.body?.action;
    if (action !== 'approve' && action !== 'reject') throw new HttpError(400, 'action must be approve or reject');
    const ids = parseIdList(req.body?.ids) ?? [];
    if (ids.length === 0) throw new HttpError(400, 'Choose at least one registration first');
    if (ids.length > MAX_BULK) throw new HttpError(400, `Choose at most ${MAX_BULK} registrations at a time`);

    // One by one: a form that cannot be added (a number taken in the meantime, say)
    // is skipped and reported, while the rest still go in.
    const done = [];
    const skipped = [];
    for (const id of ids) {
      const registration = registrations.findById(id);
      if (!registration) {
        skipped.push({ id, name: `Registration #${id}`, reason: 'it no longer exists' });
      } else if (action === 'approve') {
        const result = addToDirectory(registration, req.user.username);
        if (result.ok) done.push({ id, name: registration.name, devotee_id: result.devoteeId });
        else skipped.push({ id, name: registration.name, reason: result.message });
      } else if (registrations.review(id, { status: 'rejected', reviewer: req.user.username })) {
        done.push({ id, name: registration.name });
      } else {
        skipped.push({ id, name: registration.name, reason: `it was already ${registration.status}` });
      }
    }
    sendData(res, { action, done, skipped }, { counts: registrations.counts() });
  });

  router.post('/registrations/:id/approve', adminOnly, (req, res) => {
    const registration = registrations.findById(requireId(req.params.id));
    if (!registration) throw new HttpError(404, 'Registration not found');
    const result = addToDirectory(registration, req.user.username);
    if (!result.ok) throw new HttpError(result.status, result.message, result.details);
    sendData(res, devotees.findById(result.devoteeId), null, 201);
  });

  router.post('/registrations/:id/reject', adminOnly, (req, res) => {
    const id = requireId(req.params.id);
    if (!registrations.findById(id)) throw new HttpError(404, 'Registration not found');
    if (!registrations.review(id, { status: 'rejected', reviewer: req.user.username })) {
      throw new HttpError(409, 'This registration was already reviewed');
    }
    sendData(res, { id, status: 'rejected' });
  });

  return router;
}
