export const REGISTRATION_STATUSES = Object.freeze(['pending', 'approved', 'rejected']);
const LIST_LIMIT = 200;

const toRegistration = (row) => ({
  id: row.id,
  status: row.status,
  name: row.name,
  phone: row.phone,
  submitted_at: row.submitted_at,
  reviewed_at: row.reviewed_at,
  reviewed_by: row.reviewed_by,
  devotee_id: row.devotee_id,
  details: JSON.parse(row.payload),
});

export function createRegistrationRepository(db) {
  const insertRegistration = db.prepare('INSERT INTO registrations (name, phone, payload) VALUES (?, ?, ?)');
  const selectById = db.prepare('SELECT * FROM registrations WHERE id = ?');
  const selectByStatus = db.prepare(
    'SELECT * FROM registrations WHERE status = ? ORDER BY submitted_at DESC, id DESC LIMIT ?',
  );
  const countPendingByPhone = db.prepare("SELECT COUNT(*) AS count FROM registrations WHERE phone = ? AND status = 'pending'");
  const countsByStatus = db.prepare('SELECT status, COUNT(*) AS count FROM registrations GROUP BY status');
  const markReviewed = db.prepare(`
    UPDATE registrations
    SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), devotee_id = ?
    WHERE id = ? AND status = 'pending'`);

  return {
    create(data) {
      const id = insertRegistration.run(data.name, data.phone, JSON.stringify(data)).lastInsertRowid;
      return Number(id);
    },

    findById(id) {
      const row = selectById.get(id);
      return row ? toRegistration(row) : null;
    },

    listByStatus(status) {
      return selectByStatus.all(status, LIST_LIMIT).map(toRegistration);
    },

    countPendingWithPhone(phone) {
      return countPendingByPhone.get(phone).count;
    },

    /** Returns false when the registration was already reviewed by someone else. */
    review(id, { status, reviewer, devoteeId = null }) {
      return markReviewed.run(status, reviewer, devoteeId, id).changes > 0;
    },

    counts() {
      const counts = Object.fromEntries(REGISTRATION_STATUSES.map((status) => [status, 0]));
      for (const row of countsByStatus.all()) counts[row.status] = row.count;
      return counts;
    },
  };
}
