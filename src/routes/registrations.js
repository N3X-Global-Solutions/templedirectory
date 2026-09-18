import express from 'express';
import { HttpError, requireId, sendData } from '../http.js';
import { ROLES } from '../auth/users.js';
import { requireRole } from '../auth/middleware.js';
import { REGISTRATION_STATUSES } from '../repositories/registrations.js';
import { isPhoneConflict } from '../repositories/devotees.js';
import { validatePublicRegistration } from '../validation.js';

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

  router.post('/registrations/:id/approve', adminOnly, (req, res) => {
    const registration = registrations.findById(requireId(req.params.id));
    if (!registration) throw new HttpError(404, 'Registration not found');
    if (registration.status !== 'pending') throw new HttpError(409, `This registration was already ${registration.status}`);

    // Re-check the submitted details: they were stored as sent, and the phone may have been taken since.
    const { data, errors } = validatePublicRegistration(registration.details);
    if (errors) throw new HttpError(422, 'These details cannot be saved as they are. Please add this devotee by hand.', errors);
    const existing = devotees.findByPhone(data.phone);
    if (existing) throw new HttpError(409, `${data.phone} is already registered to ${existing.name}`, { existingId: existing.id });

    let devoteeId;
    try {
      devoteeId = devotees.create(data, req.user.username);
    } catch (error) {
      if (isPhoneConflict(error)) throw new HttpError(409, 'That phone number was registered a moment ago by someone else');
      throw error;
    }
    if (!registrations.review(registration.id, { status: 'approved', reviewer: req.user.username, devoteeId })) {
      throw new HttpError(409, 'Another admin reviewed this registration first');
    }
    sendData(res, devotees.findById(devoteeId), null, 201);
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
