import path from 'node:path';

const DEFAULT_PORT = 3000;
const DEFAULT_SESSION_HOURS = 12;
// Per client IP, per minute. Several office devices behind one router share an IP, so the API cap is generous.
const DEFAULT_API_RATE_LIMIT = 600;
const DEFAULT_EXPORT_RATE_LIMIT = 20;
// Public form submissions per hour from one IP. Mobile networks share IPs, so this is generous.
const DEFAULT_PUBLIC_FORM_RATE_LIMIT = 20;
// Ceiling on forms waiting for review, so a spammed link cannot fill the database.
const DEFAULT_PUBLIC_FORM_MAX_PENDING = 500;

function readBoolean(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Express `trust proxy` as a hop count. `true` would trust a client-supplied
 * X-Forwarded-For chain and let attackers dodge the login rate limit.
 */
function readProxyHops(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (['true', 'yes', 'on'].includes(text)) return 1;
  const hops = Number.parseInt(text, 10);
  return Number.isInteger(hops) && hops > 0 ? hops : false;
}

function readText(value, fallback) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || fallback;
}

export function loadConfig(env = process.env) {
  return Object.freeze({
    port: readPositiveInt(env.PORT, DEFAULT_PORT),
    host: readText(env.HOST, '0.0.0.0'),
    dbPath: env.DB_PATH ? path.resolve(env.DB_PATH) : path.resolve('data', 'temple-directory.db'),
    templeName: readText(env.TEMPLE_NAME, 'Sri Angalamman kovil'),
    templeTagline: readText(env.TEMPLE_TAGLINE, 'Devotee & Donor Directory'),
    adminUsername: readText(env.ADMIN_USERNAME, 'admin'),
    adminPassword: env.ADMIN_PASSWORD ?? '',
    viewerUsername: readText(env.VIEWER_USERNAME, 'viewer'),
    viewerPassword: env.VIEWER_PASSWORD ?? '',
    sessionHours: readPositiveInt(env.SESSION_HOURS, DEFAULT_SESSION_HOURS),
    secureCookies: readBoolean(env.SECURE_COOKIES, false),
    trustProxy: readProxyHops(env.TRUST_PROXY),
    viewerCanExport: readBoolean(env.VIEWER_CAN_EXPORT, false),
    apiRateLimitPerMinute: readPositiveInt(env.API_RATE_LIMIT, DEFAULT_API_RATE_LIMIT),
    exportRateLimitPerMinute: readPositiveInt(env.EXPORT_RATE_LIMIT, DEFAULT_EXPORT_RATE_LIMIT),
    publicFormRateLimitPerHour: readPositiveInt(env.PUBLIC_FORM_RATE_LIMIT, DEFAULT_PUBLIC_FORM_RATE_LIMIT),
    publicFormMaxPending: readPositiveInt(env.PUBLIC_FORM_MAX_PENDING, DEFAULT_PUBLIC_FORM_MAX_PENDING),
    // Off by default: submissions wait for an admin to approve them.
    publicFormAutoApprove: readBoolean(env.PUBLIC_FORM_AUTO_APPROVE, false),
  });
}
