import crypto from 'node:crypto';

export const PUBLIC_FORM_TOKEN = 'public_form.token';
export const PUBLIC_FORM_ENABLED = 'public_form.enabled';

const newToken = () => crypto.randomBytes(18).toString('base64url');

export function createSettingsRepository(db) {
  const selectValue = db.prepare('SELECT value FROM settings WHERE key = ?');
  const upsertValue = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`);

  const get = (key, fallback = '') => selectValue.get(key)?.value ?? fallback;
  const set = (key, value) => {
    upsertValue.run(key, String(value));
    return value;
  };

  return {
    get,
    set,
    /** The public form link is created on first use, so a fresh install always has one. */
    publicFormToken() {
      return get(PUBLIC_FORM_TOKEN) || set(PUBLIC_FORM_TOKEN, newToken());
    },
    rotatePublicFormToken() {
      return set(PUBLIC_FORM_TOKEN, newToken());
    },
    isPublicFormEnabled() {
      return get(PUBLIC_FORM_ENABLED, '1') === '1';
    },
    setPublicFormEnabled(enabled) {
      set(PUBLIC_FORM_ENABLED, enabled ? '1' : '0');
      return Boolean(enabled);
    },
  };
}
