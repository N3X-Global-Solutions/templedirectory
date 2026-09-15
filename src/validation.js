import {
  DONATION_MODES, GENDERS, MEMBER_TYPES, NAKSHATRAS, RAASIS, isCompatibleStar,
} from './constants.js';

export const LIMITS = Object.freeze({
  name: 100,
  text: 120,
  address: 500,
  notes: 2000,
  relation: 40,
  purpose: 100,
  receipt: 40,
  email: 120,
  phoneInput: 20,
  familyMembers: 30,
  donations: 500,
});

const MAX_AMOUNT_PAISE = 10_000_000_000; // ₹10 crore per entry
const RAASI_VALUES = new Set(RAASIS.map((r) => r.value));
const NAKSHATRA_VALUES = new Set(NAKSHATRAS.map((n) => n.value));
const GENDER_VALUES = new Set(GENDERS);
const MEMBER_TYPE_VALUES = new Set(MEMBER_TYPES);
const DONATION_MODE_VALUES = new Set(DONATION_MODES);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PINCODE_PATTERN = /^[1-9]\d{5}$/;
const AMOUNT_PATTERN = /^(\d{1,9})(?:\.(\d{1,2}))?$/;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Indian numbers are stored as 10 digits (+91 / 0 prefixes removed) so the same
 * person cannot be registered twice with different spellings of one number.
 * International numbers keep their leading "+".
 */
export function normalizePhone(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const compact = String(raw).trim().replace(/[\s\-().]/g, '');
  if (/^\+91\d{10}$/.test(compact)) return compact.slice(3);
  if (/^91\d{10}$/.test(compact)) return compact.slice(2);
  if (/^0\d{10}$/.test(compact)) return compact.slice(1);
  if (/^\d{10}$/.test(compact)) return compact;
  if (/^\+\d{8,15}$/.test(compact)) return compact;
  return null;
}

export function parseAmountToPaise(raw) {
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.replace(/[,₹\s]/g, '') : '';
  const match = AMOUNT_PATTERN.exec(text);
  if (!match) return null;
  const paise = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return paise > 0 && paise <= MAX_AMOUNT_PAISE ? paise : null;
}

function isRealDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function latestAllowedDate() {
  // One day of slack so IST dates entered just after midnight are not rejected as "future".
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const cleanLine = (text) => text.trim().replace(/\s+/g, ' ');
const cleanMultiline = (text) => text.replace(/\r\n?/g, '\n').split('\n').map(cleanLine).filter(Boolean).join('\n');

function createReader(source, errors, prefix = '') {
  const fail = (key, message) => {
    const path = `${prefix}${key}`;
    if (!errors[path]) errors[path] = message;
  };

  const text = (key, label, { max, required = false, multiline = false } = {}) => {
    const raw = source[key];
    if (raw !== undefined && raw !== null && typeof raw !== 'string' && typeof raw !== 'number') {
      fail(key, `${label} is invalid`);
      return '';
    }
    const value = raw == null ? '' : multiline ? cleanMultiline(String(raw)) : cleanLine(String(raw));
    if (required && !value) fail(key, `${label} is required`);
    else if (value.length > max) fail(key, `${label} must be ${max} characters or fewer`);
    return value;
  };

  const choice = (key, label, allowed) => {
    const value = text(key, label, { max: LIMITS.text });
    if (value && !allowed.has(value)) fail(key, `Select a valid ${label.toLowerCase()}`);
    return value;
  };

  const date = (key, label, { required = false } = {}) => {
    const value = text(key, label, { max: 10, required });
    if (!value) return '';
    if (!isRealDate(value)) fail(key, `${label} must be a valid date`);
    else if (value > latestAllowedDate()) fail(key, `${label} cannot be in the future`);
    return value;
  };

  const phone = (key, label, { required = false } = {}) => {
    const value = text(key, label, { max: LIMITS.phoneInput, required });
    if (!value) return '';
    const normalized = normalizePhone(value);
    if (!normalized) fail(key, `${label} must be a valid 10-digit number (or +country code)`);
    return normalized ?? '';
  };

  const stars = (raasiKey = 'raasi', starKey = 'natchathram') => {
    const raasi = choice(raasiKey, 'Raasi', RAASI_VALUES);
    const natchathram = choice(starKey, 'Natchathram', NAKSHATRA_VALUES);
    if (raasi && natchathram && RAASI_VALUES.has(raasi) && !isCompatibleStar(raasi, natchathram)) {
      fail(starKey, `${natchathram} does not fall in ${raasi} raasi`);
    }
    return { raasi, natchathram };
  };

  return { text, choice, date, phone, stars, fail };
}

const hasAnyValue = (item) => Object.values(item).some((v) => v !== null && v !== undefined && String(v).trim() !== '');

function readList(value, key, label, max, errors) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    errors[key] = `${label} must be a list`;
    return [];
  }
  if (value.length > max) {
    errors[key] = `A maximum of ${max} ${label.toLowerCase()} can be saved`;
    return [];
  }
  return value;
}

function readFamilyMembers(value, errors) {
  const list = readList(value, 'family_members', 'Family members', LIMITS.familyMembers, errors);
  return list.flatMap((item, index) => {
    const prefix = `family_members.${index}.`;
    if (!isPlainObject(item)) {
      errors[`${prefix}name`] = 'Family member entry is invalid';
      return [];
    }
    if (!hasAnyValue(item)) return [];
    const read = createReader(item, errors, prefix);
    return [{
      name: read.text('name', 'Family member name', { max: LIMITS.name, required: true }),
      relation: read.text('relation', 'Relation', { max: LIMITS.relation }),
      ...read.stars(),
    }];
  });
}

function readDonations(value, errors) {
  const list = readList(value, 'donations', 'Donations', LIMITS.donations, errors);
  return list.flatMap((item, index) => {
    const prefix = `donations.${index}.`;
    if (!isPlainObject(item)) {
      errors[`${prefix}amount`] = 'Donation entry is invalid';
      return [];
    }
    if (!hasAnyValue(item)) return [];
    const read = createReader(item, errors, prefix);
    const donatedOn = read.date('donated_on', 'Donation date', { required: true });
    const amountRaw = item.amount;
    const amountPaise = parseAmountToPaise(amountRaw);
    if (amountRaw === undefined || amountRaw === null || String(amountRaw).trim() === '') {
      read.fail('amount', 'Donation amount is required');
    } else if (amountPaise === null) {
      read.fail('amount', 'Enter an amount greater than 0 (up to 2 decimals)');
    }
    return [{
      donated_on: donatedOn,
      amount_paise: amountPaise ?? 0,
      purpose: read.text('purpose', 'Purpose', { max: LIMITS.purpose }),
      mode: read.choice('mode', 'Payment mode', DONATION_MODE_VALUES),
      receipt_no: read.text('receipt_no', 'Receipt number', { max: LIMITS.receipt }),
    }];
  });
}

/** Returns { data, errors } — exactly one of them is null. Error keys are field paths. */
export function validateDevotee(input) {
  if (!isPlainObject(input)) {
    return { data: null, errors: { _form: 'Invalid request body' } };
  }
  const errors = {};
  const read = createReader(input, errors);

  const phone = read.phone('phone', 'Phone number', { required: true });
  const altPhone = read.phone('alt_phone', 'Alternate phone');
  if (phone && altPhone && phone === altPhone) {
    read.fail('alt_phone', 'Alternate phone must be different from the main number');
  }

  const email = read.text('email', 'Email', { max: LIMITS.email }).toLowerCase();
  if (email && !EMAIL_PATTERN.test(email)) read.fail('email', 'Enter a valid email address');

  const pincode = read.text('pincode', 'Pincode', { max: 10 }).replace(/\s/g, '');
  if (pincode && !PINCODE_PATTERN.test(pincode)) read.fail('pincode', 'Pincode must be 6 digits');

  const data = {
    name: read.text('name', 'Name', { max: LIMITS.name, required: true }),
    father_name: read.text('father_name', "Father's name", { max: LIMITS.name }),
    gender: read.choice('gender', 'Gender', GENDER_VALUES),
    phone,
    alt_phone: altPhone,
    email,
    dob: read.date('dob', 'Date of birth'),
    address: read.text('address', 'Address', { max: LIMITS.address, multiline: true }),
    city: read.text('city', 'City', { max: LIMITS.text }),
    state: read.text('state', 'State', { max: LIMITS.text }),
    pincode,
    native_place: read.text('native_place', 'Native place', { max: LIMITS.text }),
    ...read.stars(),
    caste: read.text('caste', 'Caste', { max: LIMITS.text }),
    gothram: read.text('gothram', 'Gothram', { max: LIMITS.text }),
    member_type: read.choice('member_type', 'Member type', MEMBER_TYPE_VALUES) || 'Devotee',
    notes: read.text('notes', 'Notes', { max: LIMITS.notes, multiline: true }),
    family_members: readFamilyMembers(input.family_members, errors),
    donations: readDonations(input.donations, errors),
  };

  return Object.keys(errors).length > 0 ? { data: null, errors } : { data, errors: null };
}

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

export function validateNewPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) return 'Password is too long';
  return null;
}
