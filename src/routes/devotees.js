import express from 'express';
import { HttpError, parseId, requireId, sendData } from '../http.js';
import { ROLES } from '../auth/users.js';
import { requireRole } from '../auth/middleware.js';
import { parseListCriteria } from '../criteria.js';
import { isPhoneConflict } from '../repositories/devotees.js';
import { normalizePhone, validateDevotee } from '../validation.js';

function phoneTakenError(existing) {
  const message = `This phone number is already registered to ${existing.name}`;
  return new HttpError(409, message, { phone: message, existingId: existing.id });
}

function validatedOrThrow(body) {
  const { data, errors } = validateDevotee(body);
  if (errors) throw new HttpError(422, 'Please correct the highlighted fields', errors);
  return data;
}

export function createDevoteeRouter({ devotees }) {
  const router = express.Router();
  const adminOnly = requireRole(ROLES.ADMIN);

  const ensurePhoneAvailable = (phone, currentId = null) => {
    const existing = devotees.findByPhone(phone);
    if (existing && existing.id !== currentId) throw phoneTakenError(existing);
  };

  const saveOrConflict = (phone, save) => {
    try {
      return save();
    } catch (error) {
      if (isPhoneConflict(error)) throw phoneTakenError(devotees.findByPhone(phone) ?? { id: null, name: 'another devotee' });
      throw error;
    }
  };

  router.get('/stats', (req, res) => sendData(res, devotees.stats()));

  router.get('/facets', (req, res) => sendData(res, devotees.facets()));

  router.get('/devotees', (req, res) => {
    const criteria = parseListCriteria(req.query);
    const { items, total } = devotees.search(criteria);
    sendData(res, items, {
      total,
      page: criteria.page,
      pageSize: criteria.pageSize,
      pageCount: Math.max(1, Math.ceil(total / criteria.pageSize)),
    });
  });

  router.get('/devotees/phone-check', adminOnly, (req, res) => {
    const phone = normalizePhone(typeof req.query.phone === 'string' ? req.query.phone : '');
    if (!phone) throw new HttpError(400, 'Enter a valid phone number');
    const excludeId = parseId(req.query.excludeId);
    const existing = devotees.findByPhone(phone);
    const conflict = existing && existing.id !== excludeId ? existing : null;
    sendData(res, { phone, available: conflict === null, existing: conflict });
  });

  router.get('/devotees/:id', (req, res) => {
    const devotee = devotees.findById(requireId(req.params.id));
    if (!devotee) throw new HttpError(404, 'Devotee not found');
    sendData(res, devotee);
  });

  router.post('/devotees', adminOnly, (req, res) => {
    const data = validatedOrThrow(req.body);
    ensurePhoneAvailable(data.phone);
    const id = saveOrConflict(data.phone, () => devotees.create(data, req.user.username));
    sendData(res, devotees.findById(id), null, 201);
  });

  router.put('/devotees/:id', adminOnly, (req, res) => {
    const id = requireId(req.params.id);
    if (!devotees.findById(id)) throw new HttpError(404, 'Devotee not found');
    const data = validatedOrThrow(req.body);
    ensurePhoneAvailable(data.phone, id);
    const expectedVersion = parseId(req.body.version);
    const saved = saveOrConflict(data.phone, () => devotees.update(id, data, req.user.username, expectedVersion));
    if (!saved) {
      if (!devotees.findById(id)) throw new HttpError(404, 'Devotee not found — it may have just been deleted');
      throw new HttpError(409, 'Someone else saved changes to this record while you were editing. Reload the page to see the latest details, then make your changes again.', { staleVersion: true });
    }
    sendData(res, devotees.findById(id));
  });

  router.delete('/devotees/:id', adminOnly, (req, res) => {
    const id = requireId(req.params.id);
    if (!devotees.remove(id)) throw new HttpError(404, 'Devotee not found');
    sendData(res, { id, deleted: true });
  });

  return router;
}
