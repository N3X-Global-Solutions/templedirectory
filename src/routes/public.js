import crypto from 'node:crypto';
import express from 'express';
import { referenceData } from '../constants.js';
import { HttpError, sendData } from '../http.js';
import { validatePublicRegistration } from '../validation.js';

// Bots fill in every field they find; a human never sees this one.
export const HONEYPOT_FIELD = 'nickname';

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();
const tokensMatch = (given, expected) => crypto.timingSafeEqual(digest(given), digest(expected));

/**
 * Routes reachable without signing in, guarded by the secret link token.
 * They expose no directory data — only what the form needs, and a thank-you.
 */
export function createPublicRouter({ settings, registrations, devotees, config, submitLimiter }) {
  const router = express.Router();

  const checkLink = (req) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token || !tokensMatch(token, settings.publicFormToken())) {
      throw new HttpError(404, 'This registration link is not valid. Please ask the temple office for the current link.');
    }
    if (!settings.isPublicFormEnabled()) {
      throw new HttpError(403, 'Online registration is closed at the moment. Please contact the temple office.');
    }
  };

  router.get('/form', (req, res) => {
    checkLink(req);
    sendData(res, {
      temple: { name: config.templeName, tagline: config.templeTagline },
      reference: referenceData(),
    });
  });

  router.post('/registrations', submitLimiter, (req, res) => {
    checkLink(req);
    const body = req.body ?? {};
    if (typeof body[HONEYPOT_FIELD] === 'string' && body[HONEYPOT_FIELD].trim() !== '') {
      sendData(res, { received: true }, null, 201); // Silently drop obvious bot submissions.
      return;
    }

    const { data, errors } = validatePublicRegistration(body);
    if (errors) throw new HttpError(422, 'Please check the highlighted fields', errors);

    // Keeps the waiting list (and the database) bounded if the link is ever spammed.
    if (registrations.counts().pending >= config.publicFormMaxPending) {
      throw new HttpError(503, 'Online registration is paused just now. Please try again later or contact the temple office.');
    }

    // Every submission gets the same answer. Telling a stranger that a number is
    // "already registered" would let anyone with the link check who belongs to the
    // temple, so duplicates are flagged for the admin instead (see /api/registrations).
    const registrationId = registrations.create(data);
    if (config.publicFormAutoApprove && !devotees.findByPhone(data.phone)) {
      const devoteeId = devotees.create(data, 'online form');
      registrations.review(registrationId, { status: 'approved', reviewer: 'online form', devoteeId });
    }
    sendData(res, { received: true, name: data.name, addedStraightAway: config.publicFormAutoApprove }, null, 201);
  });

  return router;
}
