import crypto from 'node:crypto';
import express from 'express';
import { referenceData } from '../constants.js';
import { HttpError, sendData } from '../http.js';
import { hashPassword, verifyPassword } from '../auth/passwords.js';
import { ROLES } from '../auth/users.js';
import { SESSION_COOKIE } from '../auth/sessions.js';
import { readSessionToken, requireAuth, requireRole } from '../auth/middleware.js';
import { validateNewPassword } from '../validation.js';

const MAX_USERNAME_LENGTH = 60;
const MAX_PASSWORD_INPUT = 200;
const TIMING_DECOY_HASH = hashPassword(crypto.randomUUID());

export function buildSessionPayload(user, config) {
  return {
    user: { username: user.username, role: user.role },
    permissions: {
      canEdit: user.role === ROLES.ADMIN,
      canExport: user.role === ROLES.ADMIN || config.viewerCanExport,
      canManage: user.role === ROLES.ADMIN,
    },
    temple: { name: config.templeName, tagline: config.templeTagline },
    reference: referenceData(),
  };
}

export function createAuthRouter({ users, sessions, loginLimiter, config }) {
  const router = express.Router();
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.secureCookies,
    path: '/',
  };

  router.get('/branding', (req, res) => {
    sendData(res, { name: config.templeName, tagline: config.templeTagline });
  });

  router.post('/login', (req, res) => {
    const clientKey = req.ip ?? 'unknown';
    if (loginLimiter.isBlocked(clientKey)) {
      const minutes = Math.max(1, Math.ceil(loginLimiter.retryAfterSeconds(clientKey) / 60));
      throw new HttpError(429, `Too many failed attempts. Try again in ${minutes} minute(s).`);
    }

    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || !password || username.length > MAX_USERNAME_LENGTH || password.length > MAX_PASSWORD_INPUT) {
      throw new HttpError(400, 'Enter your username and password');
    }

    const user = users.findByUsername(username);
    // Always run the (slow) hash check so response time does not reveal whether the username exists.
    const passwordMatches = verifyPassword(password, user?.password_hash ?? TIMING_DECOY_HASH);
    if (!user || !passwordMatches) {
      loginLimiter.recordFailure(clientKey);
      throw new HttpError(401, 'Incorrect username or password');
    }

    loginLimiter.reset(clientKey);
    const token = sessions.create(user.id);
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: sessions.ttlMs });
    sendData(res, buildSessionPayload(user, config));
  });

  router.post('/logout', (req, res) => {
    sessions.destroy(readSessionToken(req));
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    sendData(res, { signedOut: true });
  });

  router.get('/session', requireAuth(sessions), (req, res) => {
    sendData(res, buildSessionPayload(req.user, config));
  });

  router.put('/password', requireAuth(sessions), requireRole(ROLES.ADMIN), (req, res) => {
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = req.body?.newPassword;
    const account = users.findById(req.user.id);
    if (!account || !verifyPassword(currentPassword, account.password_hash)) {
      throw new HttpError(400, 'Current password is incorrect', { currentPassword: 'Current password is incorrect' });
    }
    const problem = validateNewPassword(newPassword);
    if (problem) throw new HttpError(422, problem, { newPassword: problem });

    users.updatePassword(account.id, newPassword);
    sessions.destroyAllForUser(account.id, readSessionToken(req));
    sendData(res, { updated: true });
  });

  router.put('/viewer-password', requireAuth(sessions), requireRole(ROLES.ADMIN), (req, res) => {
    const newPassword = req.body?.newPassword;
    const problem = validateNewPassword(newPassword);
    if (problem) throw new HttpError(422, problem, { newPassword: problem });

    const viewer = users.findByRole(ROLES.VIEWER);
    if (!viewer) throw new HttpError(404, 'Viewer account not found');
    users.updatePassword(viewer.id, newPassword);
    sessions.destroyAllForUser(viewer.id);
    sendData(res, { updated: true, username: viewer.username });
  });

  return router;
}
