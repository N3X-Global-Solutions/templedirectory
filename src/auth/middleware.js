import { HttpError } from '../http.js';
import { SESSION_COOKIE } from './sessions.js';

export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'temple-directory';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
const LIMITER_MAX_ENTRIES = 10_000;

export function parseCookies(header) {
  if (typeof header !== 'string' || !header) return {};
  return Object.fromEntries(
    header.split(';')
      .map((part) => part.trim())
      .filter((part) => part.includes('='))
      .map((part) => {
        const index = part.indexOf('=');
        const key = part.slice(0, index).trim();
        const raw = part.slice(index + 1).trim();
        try {
          return [key, decodeURIComponent(raw)];
        } catch {
          return [key, raw];
        }
      }),
  );
}

export function readSessionToken(req) {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE] ?? '';
}

const HSTS_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

/** HSTS is only sent when the app is served over HTTPS (SECURE_COOKIES=true); on plain HTTP it would be ignored. */
export function createSecurityHeaders({ hsts = false } = {}) {
  return (req, res, next) => {
    if (hsts) res.setHeader('Strict-Transport-Security', `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`);
    securityHeaders(req, res, next);
  };
}

export function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}

export function noStore(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

/**
 * State-changing API calls must carry a custom header. Browsers cannot attach it
 * cross-site without a CORS preflight (which this server never approves), so
 * together with SameSite=Strict cookies this blocks CSRF.
 */
export function requireCsrfHeader(req, res, next) {
  const safe = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
  if (safe || req.get(CSRF_HEADER) === CSRF_HEADER_VALUE) {
    next();
    return;
  }
  next(new HttpError(403, 'Request blocked for security reasons. Please reload the page.'));
}

export function requireAuth(sessions) {
  return (req, res, next) => {
    const user = sessions.resolve(readSessionToken(req));
    if (!user) {
      next(new HttpError(401, 'Please sign in to continue'));
      return;
    }
    req.user = user;
    next();
  };
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new HttpError(403, 'You do not have permission to do this'));
      return;
    }
    next();
  };
}

/**
 * Fixed-window request limiter keyed by client IP. Guards the API against
 * scraping the directory or hammering expensive endpoints (exports, backups).
 */
export function createRateLimit({ windowMs, max, message, now = Date.now }) {
  const hits = new Map();

  const prune = (time) => {
    for (const [key, entry] of hits) if (entry.resetAt <= time) hits.delete(key);
  };

  return (req, res, next) => {
    const time = now();
    const key = req.ip ?? 'unknown';
    const existing = hits.get(key);
    const window = existing && existing.resetAt > time ? existing : { count: 0, resetAt: time + windowMs };
    const updated = { count: window.count + 1, resetAt: window.resetAt };
    if (!hits.has(key) && hits.size >= LIMITER_MAX_ENTRIES) prune(time);
    hits.set(key, updated);

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - updated.count)));
    if (updated.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((updated.resetAt - time) / 1000)));
      next(new HttpError(429, message));
      return;
    }
    next();
  };
}

/** In-memory limiter for failed sign-ins, keyed by client IP. */
export function createLoginLimiter({ windowMs = LOGIN_WINDOW_MS, maxFailures = LOGIN_MAX_FAILURES, now = Date.now } = {}) {
  const attempts = new Map();

  const current = (key) => {
    const entry = attempts.get(key);
    if (!entry || entry.resetAt <= now()) return null;
    return entry;
  };

  return {
    isBlocked(key) {
      const entry = current(key);
      return entry !== null && entry.count >= maxFailures;
    },
    retryAfterSeconds(key) {
      const entry = current(key);
      return entry ? Math.ceil((entry.resetAt - now()) / 1000) : 0;
    },
    recordFailure(key) {
      if (attempts.size >= LIMITER_MAX_ENTRIES) {
        for (const [k, entry] of attempts) if (entry.resetAt <= now()) attempts.delete(k);
      }
      const entry = current(key);
      attempts.set(key, entry
        ? { count: entry.count + 1, resetAt: entry.resetAt }
        : { count: 1, resetAt: now() + windowMs });
    },
    reset(key) {
      attempts.delete(key);
    },
  };
}
