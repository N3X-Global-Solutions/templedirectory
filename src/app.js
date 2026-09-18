import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createErrorHandler, sendData, sendError } from './http.js';
import { createUserRepository } from './auth/users.js';
import { createSessionStore } from './auth/sessions.js';
import {
  createLoginLimiter, createRateLimit, createSecurityHeaders, noStore, requireAuth, requireCsrfHeader,
} from './auth/middleware.js';
import { createDevoteeRepository } from './repositories/devotees.js';
import { createRegistrationRepository } from './repositories/registrations.js';
import { createSettingsRepository } from './repositories/settings.js';
import { createAuthRouter } from './routes/auth.js';
import { createDevoteeRouter } from './routes/devotees.js';
import { createPublicRouter } from './routes/public.js';
import { createRegistrationRouter } from './routes/registrations.js';
import { createReportsRouter } from './routes/reports.js';

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const JSON_BODY_LIMIT = '300kb';
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export function createApp({ db, config, logger = console }) {
  const users = createUserRepository(db);
  const sessions = createSessionStore(db, config);
  const devotees = createDevoteeRepository(db);
  const registrations = createRegistrationRepository(db);
  const settings = createSettingsRepository(db);
  const loginLimiter = createLoginLimiter();
  const apiLimiter = createRateLimit({
    windowMs: MINUTE_MS,
    max: config.apiRateLimitPerMinute,
    message: 'Too many requests. Please wait a minute and try again.',
  });
  const exportLimiter = createRateLimit({
    windowMs: MINUTE_MS,
    max: config.exportRateLimitPerMinute,
    message: 'Too many downloads. Please wait a minute and try again.',
  });
  // The public form is open to anyone with the link, so submissions are capped per connection.
  const publicSubmitLimiter = createRateLimit({
    windowMs: HOUR_MS,
    max: config.publicFormRateLimitPerHour,
    message: 'Too many registrations from this connection. Please try again later, or give your details at the temple office.',
  });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(createSecurityHeaders({ hsts: config.secureCookies }));

  const api = express.Router();
  api.use(apiLimiter, noStore, requireCsrfHeader, express.json({ limit: JSON_BODY_LIMIT }));
  // Used by the deploy scripts and uptime monitors; reveals nothing beyond "up and database readable".
  api.get('/health', (req, res) => {
    db.prepare('SELECT 1').get();
    sendData(res, { status: 'ok' });
  });
  api.use('/auth', createAuthRouter({ users, sessions, loginLimiter, config }));
  // Everything below /api/public is reachable without signing in, guarded by the secret link token.
  api.use('/public', createPublicRouter({ settings, registrations, devotees, config, submitLimiter: publicSubmitLimiter }));
  api.use(requireAuth(sessions));
  api.use(createDevoteeRouter({ devotees }));
  api.use(createRegistrationRouter({ settings, registrations, devotees }));
  api.use(createReportsRouter({ db, devotees, config, logger, exportLimiter }));
  api.use((req, res) => sendError(res, 404, 'Not found'));

  app.use('/api', api);
  // Shareable link for devotees: /join/<token> serves the public form page.
  const servePublicForm = (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'join.html'));
  app.get('/join', servePublicForm);
  app.get('/join/:token', servePublicForm);
  app.use(express.static(PUBLIC_DIR, { index: 'index.html' }));
  app.use(createErrorHandler(logger));

  return { app, users };
}
