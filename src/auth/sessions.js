import crypto from 'node:crypto';

export const SESSION_COOKIE = 'td_session';

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** Sessions live in SQLite (only a hash of the token is stored) so logout and password resets revoke access. */
export function createSessionStore(db, { sessionHours }) {
  const ttlMs = sessionHours * 60 * 60 * 1000;
  const insertSession = db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)');
  const selectSession = db.prepare(`
    SELECT u.id, u.username, u.role, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?`);
  const deleteSession = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  const deleteUserSessions = db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?');
  const purgeExpired = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');

  return {
    ttlMs,
    create(userId) {
      purgeExpired.run(Date.now());
      const token = crypto.randomBytes(32).toString('base64url');
      insertSession.run(hashToken(token), userId, Date.now() + ttlMs);
      return token;
    },
    resolve(token) {
      if (typeof token !== 'string' || token.length === 0 || token.length > 200) return null;
      const row = selectSession.get(hashToken(token));
      if (!row) return null;
      if (row.expires_at <= Date.now()) {
        deleteSession.run(hashToken(token));
        return null;
      }
      return { id: row.id, username: row.username, role: row.role };
    },
    destroy(token) {
      if (typeof token === 'string' && token) deleteSession.run(hashToken(token));
    },
    /** Revoke every session of a user except (optionally) the one making the request. */
    destroyAllForUser(userId, exceptToken = '') {
      deleteUserSessions.run(userId, exceptToken ? hashToken(exceptToken) : '');
    },
  };
}
