import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, parseAmountToPaise, validateDevotee, validateNewPassword } from '../src/validation.js';
import { isCompatibleStar } from '../src/constants.js';
import { csvCell, toCsv } from '../src/csv.js';
import { parseIdList, parseListCriteria } from '../src/criteria.js';
import { createLoginLimiter, parseCookies } from '../src/auth/middleware.js';
import { hashPassword, verifyPassword } from '../src/auth/passwords.js';
import { sampleDevotee } from './helpers.js';

describe('normalizePhone', () => {
  test('strips Indian prefixes and separators to 10 digits', () => {
    assert.equal(normalizePhone('+91 98765-43210'), '9876543210');
    assert.equal(normalizePhone('919876543210'), '9876543210');
    assert.equal(normalizePhone('09876543210'), '9876543210');
    assert.equal(normalizePhone('(987) 654 3210'), '9876543210');
  });

  test('keeps international numbers with a plus sign', () => {
    assert.equal(normalizePhone('+1 415 555 1234'), '+14155551234');
  });

  test('rejects short, long and non-numeric input', () => {
    assert.equal(normalizePhone('12345'), null);
    assert.equal(normalizePhone('98765432101234'), null);
    assert.equal(normalizePhone('abc'), null);
    assert.equal(normalizePhone({}), null);
  });
});

describe('parseAmountToPaise', () => {
  test('converts rupees with up to two decimals without float drift', () => {
    assert.equal(parseAmountToPaise('1,001.5'), 100150);
    assert.equal(parseAmountToPaise('0.10'), 10);
    assert.equal(parseAmountToPaise(251), 25100);
    assert.equal(parseAmountToPaise('₹ 108'), 10800);
  });

  test('rejects zero, negatives and too many decimals', () => {
    assert.equal(parseAmountToPaise('0'), null);
    assert.equal(parseAmountToPaise('-5'), null);
    assert.equal(parseAmountToPaise('10.555'), null);
    assert.equal(parseAmountToPaise(''), null);
  });
});

describe('validateDevotee', () => {
  test('accepts a complete record and normalises values', () => {
    const { data, errors } = validateDevotee(sampleDevotee({ email: ' Murugan@Example.COM ', pincode: '613 001' }));
    assert.equal(errors, null);
    assert.equal(data.phone, '9876543210');
    assert.equal(data.email, 'murugan@example.com');
    assert.equal(data.pincode, '613001');
    assert.equal(data.address, '12, North Car Street\nNear Big Temple');
    assert.equal(data.family_members.length, 2);
    assert.equal(data.donations[0].amount_paise, 500100);
  });

  test('requires name and phone', () => {
    const { data, errors } = validateDevotee({});
    assert.equal(data, null);
    assert.equal(errors.name, 'Name is required');
    assert.equal(errors.phone, 'Phone number is required');
  });

  test('rejects a natchathram outside the chosen raasi', () => {
    const { errors } = validateDevotee(sampleDevotee({ raasi: 'Mesham', natchathram: 'Revathi' }));
    assert.match(errors.natchathram, /does not fall in Mesham/);
  });

  test('flags invalid pincode, email, dates, gender and duplicate alternate phone', () => {
    const { errors } = validateDevotee(sampleDevotee({
      pincode: '12345', email: 'nope', dob: '2999-01-01', gender: 'Unknown', alt_phone: '9876543210',
    }));
    assert.ok(errors.pincode);
    assert.ok(errors.email);
    assert.match(errors.dob, /future/);
    assert.ok(errors.gender);
    assert.ok(errors.alt_phone);
  });

  test('skips blank family/donation rows but reports incomplete ones by index', () => {
    const { errors } = validateDevotee(sampleDevotee({
      family_members: [{ name: '', relation: '' }, { relation: 'Son' }],
      donations: [{}, { donated_on: '2026-02-30', amount: 'abc' }],
    }));
    assert.equal(errors['family_members.1.name'], 'Family member name is required');
    assert.equal(errors['family_members.0.name'], undefined);
    assert.ok(errors['donations.1.donated_on']);
    assert.ok(errors['donations.1.amount']);
  });

  test('rejects non-object bodies and oversized lists', () => {
    assert.deepEqual(validateDevotee(null).errors, { _form: 'Invalid request body' });
    const many = Array.from({ length: 31 }, (_, i) => ({ name: `Member ${i}` }));
    assert.ok(validateDevotee(sampleDevotee({ family_members: many })).errors.family_members);
    assert.ok(validateDevotee(sampleDevotee({ donations: 'x' })).errors.donations);
  });

  test('enforces text length limits', () => {
    const { errors } = validateDevotee(sampleDevotee({ name: 'x'.repeat(101) }));
    assert.match(errors.name, /100 characters/);
  });

  test('reads occupation and limits its length', () => {
    assert.equal(validateDevotee(sampleDevotee({ occupation: '  School   Teacher ' })).data.occupation, 'School Teacher');
    assert.ok(validateDevotee(sampleDevotee({ occupation: 'x'.repeat(121) })).errors.occupation);
  });

  test('hundiyal wanted accepts yes/no in common forms and defaults to no', () => {
    for (const yes of [true, 'yes', 'Yes', '1', 1, 'true']) {
      assert.equal(validateDevotee(sampleDevotee({ hundiyal_wanted: yes })).data.hundiyal_wanted, true, String(yes));
    }
    for (const no of [false, 'no', 'NO', '0', 0, 'false', '', undefined, null]) {
      assert.equal(validateDevotee(sampleDevotee({ hundiyal_wanted: no })).data.hundiyal_wanted, false, String(no));
    }
    assert.match(validateDevotee(sampleDevotee({ hundiyal_wanted: 'maybe' })).errors.hundiyal_wanted, /Yes or No/);
  });

  test('family member phone is optional, normalised and validated per row', () => {
    const { data } = validateDevotee(sampleDevotee({
      family_members: [{ name: 'Valli', phone: '+91 94440-12345' }, { name: 'Karthik' }],
    }));
    assert.equal(data.family_members[0].phone, '9444012345');
    assert.equal(data.family_members[1].phone, '');
    const { errors } = validateDevotee(sampleDevotee({ family_members: [{ name: 'Valli', phone: '123' }] }));
    assert.ok(errors['family_members.0.phone']);
  });
});

describe('helpers', () => {
  test('isCompatibleStar knows stars that span two raasis', () => {
    assert.ok(isCompatibleStar('Mesham', 'Karthigai'));
    assert.ok(isCompatibleStar('Rishabam', 'Karthigai'));
    assert.ok(!isCompatibleStar('Meenam', 'Ashwini'));
    assert.ok(!isCompatibleStar('Unknown', 'Ashwini'));
  });

  test('csvCell quotes special characters and neutralises formulas', () => {
    assert.equal(csvCell('a,b'), '"a,b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
    assert.equal(csvCell(null), '');
    assert.ok(toCsv([{ header: 'Name', value: (r) => r.n }], [{ n: 'முருகன்' }]).startsWith('﻿Name\r\nமுருகன்'));
  });

  test('parseListCriteria whitelists sort, page size and filters', () => {
    const criteria = parseListCriteria({ q: '  ram ', sort: 'DROP TABLE', dir: 'desc', page: '-3', pageSize: '999', raasi: 'Mesham', bogus: 'x' });
    assert.deepEqual(criteria, { q: 'ram', filters: { raasi: 'Mesham' }, sort: 'name', dir: 'desc', page: 1, pageSize: 25 });
  });

  test('parseIdList accepts csv or arrays and drops junk', () => {
    assert.equal(parseIdList(undefined), null);
    assert.deepEqual(parseIdList('3, 1,abc,3,0'), [3, 1]);
    assert.deepEqual(parseIdList([5, '6', -1]), [5, 6]);
  });

  test('parseCookies decodes values and tolerates malformed input', () => {
    assert.deepEqual(parseCookies('a=1; td_session=abc%3D; broken'), { a: '1', td_session: 'abc=' });
    assert.deepEqual(parseCookies('x=%E0%A4%A'), { x: '%E0%A4%A' });
    assert.deepEqual(parseCookies(undefined), {});
  });

  test('password hashing verifies only the right password', () => {
    const hash = hashPassword('correct horse');
    assert.ok(verifyPassword('correct horse', hash));
    assert.ok(!verifyPassword('wrong', hash));
    assert.ok(!verifyPassword('correct horse', 'garbage'));
    assert.equal(validateNewPassword('short'), 'Password must be at least 8 characters');
    assert.equal(validateNewPassword('long enough'), null);
  });

  test('login limiter blocks after repeated failures and resets after the window', () => {
    let clock = 0;
    const limiter = createLoginLimiter({ windowMs: 1000, maxFailures: 2, now: () => clock });
    limiter.recordFailure('ip');
    assert.ok(!limiter.isBlocked('ip'));
    limiter.recordFailure('ip');
    assert.ok(limiter.isBlocked('ip'));
    assert.equal(limiter.retryAfterSeconds('ip'), 1);
    clock = 1001;
    assert.ok(!limiter.isBlocked('ip'));
  });
});
