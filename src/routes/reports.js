import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import { HttpError, sendData } from '../http.js';
import { ROLES } from '../auth/users.js';
import { requireRole } from '../auth/middleware.js';
import { parseIdList, parseListCriteria } from '../criteria.js';
import { oneLine, rupees, sendCsv, toCsv } from '../csv.js';
import { formatTamilDate, tamilDate } from '../../public/js/tamilCalendar.js';

const POOJA_MIN_QUERY = 2;
const POOJA_MAX_QUERY = 100;

const today = () => new Date().toISOString().slice(0, 10);

const MAILING_COLUMNS = [
  { header: 'Name', value: (r) => r.name },
  { header: "Father's Name", value: (r) => r.father_name },
  { header: 'Address', value: (r) => oneLine(r.address) },
  { header: 'City', value: (r) => r.city },
  { header: 'State', value: (r) => r.state },
  { header: 'Pincode', value: (r) => r.pincode },
  { header: 'Phone', value: (r) => r.phone },
];

const FULL_EXPORT_COLUMNS = [
  { header: 'ID', value: (r) => r.id },
  { header: 'Name', value: (r) => r.name },
  { header: "Father's Name", value: (r) => r.father_name },
  { header: 'Gender', value: (r) => r.gender },
  { header: 'Phone', value: (r) => r.phone },
  { header: 'Alternate Phone', value: (r) => r.alt_phone },
  { header: 'Email', value: (r) => r.email },
  { header: 'Date of Birth', value: (r) => r.dob },
  { header: 'Tamil Birthday', value: (r) => formatTamilDate(r.dob) },
  { header: 'Address', value: (r) => oneLine(r.address) },
  { header: 'City', value: (r) => r.city },
  { header: 'State', value: (r) => r.state },
  { header: 'Pincode', value: (r) => r.pincode },
  { header: 'Native Place', value: (r) => r.native_place },
  { header: 'Raasi', value: (r) => r.raasi },
  { header: 'Natchathram', value: (r) => r.natchathram },
  { header: 'Caste', value: (r) => r.caste },
  { header: 'Gothram', value: (r) => r.gothram },
  { header: 'Member Type', value: (r) => r.member_type },
  { header: 'Occupation', value: (r) => r.occupation },
  { header: 'Hundiyal Wanted', value: (r) => (r.hundiyal_wanted ? 'Yes' : 'No') },
  { header: 'Family Members', value: (r) => r.family_members_text },
  { header: 'Total Donations (INR)', value: (r) => rupees(r.total_donation_paise) },
  { header: 'Notes', value: (r) => oneLine(r.notes) },
  { header: 'Registered On', value: (r) => r.created_at },
  { header: 'Last Updated', value: (r) => r.updated_at },
];

export function createReportsRouter({ db, devotees, config, logger, exportLimiter }) {
  const router = express.Router();
  const adminOnly = requireRole(ROLES.ADMIN);
  const exporters = config.viewerCanExport ? requireRole(ROLES.ADMIN, ROLES.VIEWER) : adminOnly;

  const mailingCriteria = (source, ids) => ({ ...parseListCriteria(source), ids });

  router.get('/mailing', (req, res) => {
    const { items, total, limited } = devotees.mailingList(mailingCriteria(req.query, parseIdList(req.query.ids)));
    sendData(res, items, { total, limited });
  });

  router.post('/mailing/export', exporters, exportLimiter, (req, res) => {
    const body = req.body ?? {};
    const ids = parseIdList(body.ids);
    const { items } = devotees.mailingList(mailingCriteria(body.criteria, ids));
    const scope = ids ? 'selected' : 'all';
    sendCsv(res, `mailing-addresses-${scope}-${today()}.csv`, toCsv(MAILING_COLUMNS, items));
  });

  router.get('/export/full', adminOnly, exportLimiter, (req, res) => {
    sendCsv(res, `temple-directory-full-${today()}.csv`, toCsv(FULL_EXPORT_COLUMNS, devotees.exportAll()));
  });

  router.get('/backup', adminOnly, exportLimiter, (req, res, next) => {
    // Private (0700) directory so other OS users cannot read the copy while it is being sent.
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'temple-backup-'));
    fs.chmodSync(tempDir, 0o700);
    const tempFile = path.join(tempDir, `${crypto.randomUUID()}.db`);
    const cleanup = () => fs.rm(tempDir, { recursive: true, force: true }, (error) => {
      if (error) logger.error(`[backup] Could not remove temporary backup ${tempDir}`, error);
    });
    try {
      db.prepare('VACUUM INTO ?').run(tempFile);
    } catch (error) {
      cleanup();
      next(error);
      return;
    }
    res.download(tempFile, `temple-directory-backup-${today()}.db`, (error) => {
      cleanup();
      if (error && !res.headersSent) next(error);
    });
  });

  router.get('/pooja', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < POOJA_MIN_QUERY) {
      throw new HttpError(400, `Type at least ${POOJA_MIN_QUERY} characters of a name or phone number`);
    }
    // Only the Tamil birth month is shared here — the full date of birth stays on the record page.
    const households = devotees.poojaLookup(q.slice(0, POOJA_MAX_QUERY)).map(({ dob, ...household }) => ({
      ...household,
      tamil_birth_month: tamilDate(dob)?.month ?? null,
    }));
    sendData(res, households);
  });

  return router;
}
