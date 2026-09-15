import { withTransaction } from '../db.js';

export const DEVOTEE_FIELDS = Object.freeze([
  'name', 'father_name', 'gender', 'phone', 'alt_phone', 'email', 'dob', 'address', 'city', 'state',
  'pincode', 'native_place', 'raasi', 'natchathram', 'caste', 'gothram', 'member_type', 'notes',
]);

export const MAILING_LIMIT = 5000;
export const POOJA_LIMIT = 25;
const EXPORT_LIMIT = 50_000;

/** Whitelisted sort keys → SQL. `blank` pushes empty values to the end regardless of direction. */
export const SORT_COLUMNS = Object.freeze({
  name: { expr: 'd.name COLLATE NOCASE' },
  city: { expr: 'd.city COLLATE NOCASE', blank: 'd.city' },
  state: { expr: 'd.state COLLATE NOCASE', blank: 'd.state' },
  pincode: { expr: 'd.pincode', blank: 'd.pincode' },
  raasi: { expr: 'd.raasi', blank: 'd.raasi' },
  natchathram: { expr: 'd.natchathram', blank: 'd.natchathram' },
  gothram: { expr: 'd.gothram COLLATE NOCASE', blank: 'd.gothram' },
  donation: { expr: 'total_donation_paise' },
  created: { expr: 'd.created_at' },
  updated: { expr: 'd.updated_at' },
});

const EXACT_FILTERS = Object.freeze({
  gender: 'd.gender',
  raasi: 'd.raasi',
  natchathram: 'd.natchathram',
  memberType: 'd.member_type',
});

const NOCASE_FILTERS = Object.freeze({
  state: 'd.state',
  city: 'd.city',
  caste: 'd.caste',
  gothram: 'd.gothram',
});

const FACET_COLUMNS = Object.freeze({ cities: 'city', states: 'state', castes: 'caste', gothrams: 'gothram' });

const TOTALS_JOIN = `LEFT JOIN (
  SELECT devotee_id, SUM(amount_paise) AS total FROM donations GROUP BY devotee_id
) ds ON ds.devotee_id = d.id`;

const escapeLike = (value) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

function searchTerms(q) {
  const like = `%${escapeLike(q)}%`;
  const digits = q.replace(/[\s\-+()]/g, '');
  return { like, phoneLike: /^\d{3,}$/.test(digits) ? `%${digits}%` : like };
}

export function buildCriteriaSql({ q = '', filters = {}, ids = null } = {}) {
  const clauses = [];
  const params = [];
  const term = q.trim();

  if (term) {
    const { like, phoneLike } = searchTerms(term);
    clauses.push(`(
      d.name LIKE ? ESCAPE '\\' OR d.father_name LIKE ? ESCAPE '\\'
      OR d.phone LIKE ? ESCAPE '\\' OR d.alt_phone LIKE ? ESCAPE '\\'
      OR d.city LIKE ? ESCAPE '\\' OR d.pincode LIKE ? ESCAPE '\\'
      OR d.gothram LIKE ? ESCAPE '\\' OR d.native_place LIKE ? ESCAPE '\\' OR d.email LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM family_members f WHERE f.devotee_id = d.id AND f.name LIKE ? ESCAPE '\\')
    )`);
    params.push(like, like, phoneLike, phoneLike, like, like, like, like, like, like);
  }

  for (const [key, column] of Object.entries(EXACT_FILTERS)) {
    if (filters[key]) {
      clauses.push(`${column} = ?`);
      params.push(filters[key]);
    }
  }
  for (const [key, column] of Object.entries(NOCASE_FILTERS)) {
    if (filters[key]) {
      clauses.push(`${column} = ? COLLATE NOCASE`);
      params.push(filters[key]);
    }
  }
  if (filters.donations === 'yes') clauses.push('COALESCE(ds.total, 0) > 0');
  if (filters.donations === 'no') clauses.push('COALESCE(ds.total, 0) = 0');

  if (Array.isArray(ids)) {
    if (ids.length === 0) {
      clauses.push('0');
    } else {
      clauses.push(`d.id IN (${ids.map(() => '?').join(', ')})`);
      params.push(...ids);
    }
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

function orderBySql(sort, dir) {
  const column = SORT_COLUMNS[sort] ?? SORT_COLUMNS.name;
  const direction = dir === 'desc' ? 'DESC' : 'ASC';
  const blankFirst = column.blank ? `(${column.blank} = '') ASC, ` : '';
  return `ORDER BY ${blankFirst}${column.expr} ${direction}, d.name COLLATE NOCASE ASC, d.id ASC`;
}

function groupBy(rows, key) {
  return rows.reduce((groups, row) => {
    const { [key]: groupKey, ...rest } = row;
    const existing = groups.get(groupKey) ?? [];
    return groups.set(groupKey, [...existing, rest]);
  }, new Map());
}

export function isPhoneConflict(error) {
  return /UNIQUE constraint failed: devotees\.phone/.test(String(error?.message));
}

export function createDevoteeRepository(db) {
  const columns = DEVOTEE_FIELDS.join(', ');
  const insertDevotee = db.prepare(
    `INSERT INTO devotees (${columns}, created_by, updated_by) VALUES (${DEVOTEE_FIELDS.map(() => '?').join(', ')}, ?, ?)`,
  );
  const updateDevotee = db.prepare(
    `UPDATE devotees SET ${DEVOTEE_FIELDS.map((f) => `${f} = ?`).join(', ')}, updated_by = ?, updated_at = datetime('now'),
       version = version + 1
     WHERE id = ? AND (? IS NULL OR version = ?)`,
  );
  const deleteDevotee = db.prepare('DELETE FROM devotees WHERE id = ?');
  const selectDevotee = db.prepare(
    `SELECT d.*, COALESCE(ds.total, 0) AS total_donation_paise FROM devotees d ${TOTALS_JOIN} WHERE d.id = ?`,
  );
  const selectByPhone = db.prepare('SELECT id, name FROM devotees WHERE phone = ?');
  const insertMember = db.prepare(
    'INSERT INTO family_members (devotee_id, position, name, relation, raasi, natchathram) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const deleteMembers = db.prepare('DELETE FROM family_members WHERE devotee_id = ?');
  const selectMembers = db.prepare(
    'SELECT id, name, relation, raasi, natchathram FROM family_members WHERE devotee_id = ? ORDER BY position, id',
  );
  const insertDonation = db.prepare(
    'INSERT INTO donations (devotee_id, donated_on, amount_paise, purpose, mode, receipt_no) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const deleteDonations = db.prepare('DELETE FROM donations WHERE devotee_id = ?');
  const selectDonations = db.prepare(
    'SELECT id, donated_on, amount_paise, purpose, mode, receipt_no FROM donations WHERE devotee_id = ? ORDER BY donated_on DESC, id DESC',
  );

  const fieldValues = (data) => DEVOTEE_FIELDS.map((field) => data[field]);

  function writeChildren(id, data) {
    deleteMembers.run(id);
    data.family_members.forEach((m, index) => insertMember.run(id, index, m.name, m.relation, m.raasi, m.natchathram));
    deleteDonations.run(id);
    data.donations.forEach((d) => insertDonation.run(id, d.donated_on, d.amount_paise, d.purpose, d.mode, d.receipt_no));
  }

  function membersByDevotee(ids) {
    if (ids.length === 0) return new Map();
    const rows = db.prepare(`
      SELECT devotee_id, name, relation, raasi, natchathram FROM family_members
      WHERE devotee_id IN (${ids.map(() => '?').join(', ')}) ORDER BY devotee_id, position, id`).all(...ids);
    return groupBy(rows, 'devotee_id');
  }

  return {
    create(data, username) {
      return withTransaction(db, () => {
        const id = Number(insertDevotee.run(...fieldValues(data), username, username).lastInsertRowid);
        writeChildren(id, data);
        return id;
      });
    },

    /**
     * Replaces the record and its family/donation lists. When expectedVersion is
     * given the write only happens if nobody else saved in the meantime.
     * Returns false when no row matched (deleted, or stale version).
     */
    update(id, data, username, expectedVersion = null) {
      return withTransaction(db, () => {
        const changed = updateDevotee.run(...fieldValues(data), username, id, expectedVersion, expectedVersion).changes > 0;
        if (changed) writeChildren(id, data);
        return changed;
      });
    },

    remove(id) {
      return deleteDevotee.run(id).changes > 0;
    },

    findById(id) {
      const devotee = selectDevotee.get(id);
      if (!devotee) return null;
      return { ...devotee, family_members: selectMembers.all(id), donations: selectDonations.all(id) };
    },

    findByPhone(phone) {
      return selectByPhone.get(phone) ?? null;
    },

    search(criteria) {
      const { where, params } = buildCriteriaSql(criteria);
      const total = db.prepare(`SELECT COUNT(*) AS n FROM devotees d ${TOTALS_JOIN} ${where}`).get(...params).n;
      const offset = (criteria.page - 1) * criteria.pageSize;
      const items = db.prepare(`
        SELECT d.id, d.name, d.father_name, d.gender, d.phone, d.city, d.state, d.pincode, d.raasi, d.natchathram,
               d.caste, d.gothram, d.member_type, d.updated_at,
               COALESCE(ds.total, 0) AS total_donation_paise,
               (SELECT COUNT(*) FROM family_members f WHERE f.devotee_id = d.id) AS family_count
        FROM devotees d ${TOTALS_JOIN} ${where}
        ${orderBySql(criteria.sort, criteria.dir)}
        LIMIT ? OFFSET ?`).all(...params, criteria.pageSize, offset);
      return { items, total };
    },

    mailingList(criteria) {
      const { where, params } = buildCriteriaSql(criteria);
      const total = db.prepare(`SELECT COUNT(*) AS n FROM devotees d ${TOTALS_JOIN} ${where}`).get(...params).n;
      const items = db.prepare(`
        SELECT d.id, d.name, d.father_name, d.gender, d.phone, d.address, d.city, d.state, d.pincode,
               COALESCE(ds.total, 0) AS total_donation_paise
        FROM devotees d ${TOTALS_JOIN} ${where}
        ${orderBySql(criteria.sort, criteria.dir)}
        LIMIT ?`).all(...params, MAILING_LIMIT);
      return { items, total, limited: total > items.length };
    },

    exportAll() {
      return db.prepare(`
        SELECT d.*, COALESCE(ds.total, 0) AS total_donation_paise,
               (SELECT group_concat(f.name || CASE WHEN f.relation <> '' THEN ' (' || f.relation || ')' ELSE '' END, '; ')
                  FROM family_members f WHERE f.devotee_id = d.id) AS family_members_text
        FROM devotees d ${TOTALS_JOIN}
        ORDER BY d.name COLLATE NOCASE LIMIT ?`).all(EXPORT_LIMIT);
    },

    poojaLookup(query) {
      const term = query.trim();
      const { like, phoneLike } = searchTerms(term);
      const rows = db.prepare(`
        SELECT d.id, d.name, d.father_name, d.phone, d.city, d.gothram, d.raasi, d.natchathram
        FROM devotees d
        WHERE d.name LIKE ? ESCAPE '\\' OR d.phone LIKE ? ESCAPE '\\' OR d.alt_phone LIKE ? ESCAPE '\\'
           OR EXISTS (SELECT 1 FROM family_members f WHERE f.devotee_id = d.id AND f.name LIKE ? ESCAPE '\\')
        ORDER BY CASE WHEN d.name LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END, d.name COLLATE NOCASE
        LIMIT ?`).all(like, phoneLike, phoneLike, like, `${escapeLike(term)}%`, POOJA_LIMIT);
      const members = membersByDevotee(rows.map((row) => row.id));
      return rows.map((row) => ({ ...row, family_members: members.get(row.id) ?? [] }));
    },

    facets() {
      return Object.fromEntries(Object.entries(FACET_COLUMNS).map(([key, column]) => [
        key,
        db.prepare(`SELECT MIN(${column}) AS value FROM devotees WHERE ${column} <> ''
                    GROUP BY ${column} COLLATE NOCASE ORDER BY ${column} COLLATE NOCASE`).all().map((r) => r.value),
      ]));
    },

    stats() {
      return db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM devotees) AS devotees,
          (SELECT COUNT(*) FROM family_members) AS family_members,
          (SELECT COUNT(DISTINCT devotee_id) FROM donations) AS donors,
          (SELECT COALESCE(SUM(amount_paise), 0) FROM donations) AS total_donation_paise,
          (SELECT COALESCE(SUM(amount_paise), 0) FROM donations
             WHERE substr(donated_on, 1, 4) = strftime('%Y', 'now')) AS year_donation_paise`).get();
    },
  };
}
