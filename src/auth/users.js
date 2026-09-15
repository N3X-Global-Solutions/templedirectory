import { validateNewPassword } from '../validation.js';
import { generatePassword, hashPassword } from './passwords.js';

export const ROLES = Object.freeze({ ADMIN: 'admin', VIEWER: 'viewer' });

export function createUserRepository(db) {
  const selectByUsername = db.prepare('SELECT id, username, role, password_hash FROM users WHERE username = ?');
  const selectById = db.prepare('SELECT id, username, role, password_hash FROM users WHERE id = ?');
  const selectByRole = db.prepare('SELECT id, username, role FROM users WHERE role = ? ORDER BY id LIMIT 1');
  const insertUser = db.prepare('INSERT INTO users (username, role, password_hash) VALUES (?, ?, ?)');
  const updatePasswordHash = db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?");

  return {
    findByUsername: (username) => selectByUsername.get(username) ?? null,
    findById: (id) => selectById.get(id) ?? null,
    findByRole: (role) => selectByRole.get(role) ?? null,
    create: (username, role, password) => Number(insertUser.run(username, role, hashPassword(password)).lastInsertRowid),
    updatePassword: (id, password) => updatePasswordHash.run(hashPassword(password), id).changes > 0,
  };
}

/**
 * Creates the admin and viewer accounts on first run. Passwords come from the
 * environment; when absent a random one is generated and returned so the
 * server can print it once.
 */
export function ensureDefaultUsers(users, config) {
  const accounts = [
    { role: ROLES.ADMIN, username: config.adminUsername, password: config.adminPassword },
    { role: ROLES.VIEWER, username: config.viewerUsername, password: config.viewerPassword },
  ];

  return accounts
    .filter((account) => users.findByRole(account.role) === null)
    .map((account) => {
      if (account.password) {
        const problem = validateNewPassword(account.password);
        if (problem) throw new Error(`${account.role.toUpperCase()}_PASSWORD: ${problem}`);
      }
      const password = account.password || generatePassword();
      users.create(account.username, account.role, password);
      return { ...account, password, generated: !account.password };
    });
}
