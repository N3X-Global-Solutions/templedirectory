import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { TAMIL_MONTHS, tamilDate } from '../public/js/tamilCalendar.js';

const monthOf = (iso) => tamilDate(iso).month.en;

describe('tamilDate', () => {
  test('17 Feb 2002 falls in Maasi (the example from the temple)', () => {
    const result = tamilDate('2002-02-17');
    assert.equal(result.month.en, 'Maasi');
    assert.equal(result.month.ta, 'மாசி');
  });

  test('Tamil New Year (Chithirai 1) matches the official holiday dates', () => {
    // 2024: Mesha Sankranti was after sunset on 13 April, so Chithirai 1 is the 14th.
    for (const newYear of ['2023-04-14', '2024-04-14', '2025-04-14', '2026-04-14']) {
      const result = tamilDate(newYear);
      assert.equal(result.month.en, 'Chithirai', newYear);
      assert.equal(result.day, 1, newYear);
    }
    for (const eve of ['2023-04-13', '2024-04-13', '2025-04-13']) {
      assert.equal(monthOf(eve), 'Panguni', eve);
    }
  });

  test('Thai Pongal (Thai 1) matches the festival dates', () => {
    // 2023: Makara Sankranti was after sunset on 14 January, so Pongal was the 15th.
    for (const pongal of ['2023-01-15', '2024-01-15', '2025-01-14', '2026-01-14']) {
      const result = tamilDate(pongal);
      assert.equal(result.month.en, 'Thai', pongal);
      assert.equal(result.day, 1, pongal);
    }
    assert.equal(monthOf('2023-01-14'), 'Margazhi');
    assert.equal(monthOf('2025-01-13'), 'Margazhi');
  });

  test('day numbers count up through the month and reset at the next month', () => {
    assert.equal(tamilDate('2025-04-20').day, 7);
    const lastPanguni = tamilDate('2025-04-13');
    assert.ok(lastPanguni.day >= 29 && lastPanguni.day <= 32, `got ${lastPanguni.day}`);
  });

  test('every month appears in order across a year', () => {
    const seen = [];
    for (let day = 0; day < 366; day += 1) {
      const iso = new Date(Date.UTC(2025, 3, 14 + day)).toISOString().slice(0, 10);
      const { en } = tamilDate(iso).month;
      if (seen.at(-1) !== en) seen.push(en);
    }
    assert.deepEqual(seen.slice(0, 12), TAMIL_MONTHS.map((m) => m.en));
  });

  test('Tamil year name follows the 60-year cycle and changes on Chithirai 1', () => {
    assert.equal(tamilDate('2024-04-13').year.en, 'Sobakruthu');
    assert.equal(tamilDate('2024-04-14').year.en, 'Krodhi');
    assert.equal(tamilDate('2025-06-01').year.en, 'Visuvaavasu');
    assert.equal(tamilDate('2002-02-17').year.en, 'Vishu');
    assert.equal(tamilDate('1987-04-20').year.en, 'Prabhava');
    assert.equal(tamilDate('1987-04-20').year.ta, 'பிரபவ');
  });

  test('Margazhi dates in January belong to the previous Tamil year', () => {
    assert.equal(tamilDate('2025-01-05').month.en, 'Margazhi');
    assert.equal(tamilDate('2025-01-05').year.en, 'Krodhi');
    assert.equal(tamilDate('2024-12-20').year.en, 'Krodhi');
  });

  test('works for old birth dates', () => {
    assert.equal(monthOf('1935-08-25'), 'Aavani');
    assert.equal(monthOf('1950-11-30'), 'Karthigai');
  });

  test('returns null for empty or invalid dates', () => {
    assert.equal(tamilDate(''), null);
    assert.equal(tamilDate(null), null);
    assert.equal(tamilDate('2025-02-30'), null);
    assert.equal(tamilDate('not-a-date'), null);
  });
});
