import { SORT_COLUMNS } from './repositories/devotees.js';

export const PAGE_SIZES = Object.freeze([10, 25, 50, 100]);
export const DEFAULT_PAGE_SIZE = 25;
export const FILTER_KEYS = Object.freeze([
  'gender', 'memberType', 'raasi', 'natchathram', 'state', 'city', 'caste', 'gothram', 'occupation',
  'hundiyal', 'japaHoma', 'annadhanam', 'donations',
]);

const MAX_TEXT_LENGTH = 100;
const MAX_IDS = 5000;

const readText = (value) => (typeof value === 'string' ? value.trim().slice(0, MAX_TEXT_LENGTH) : '');

function readPage(value) {
  const page = Number.parseInt(value, 10);
  return Number.isInteger(page) && page > 0 && page < 1_000_000 ? page : 1;
}

/** Turns untrusted query/body input into a whitelisted criteria object for the repository. */
export function parseListCriteria(input = {}) {
  const source = input !== null && typeof input === 'object' ? input : {};
  const filters = Object.fromEntries(
    FILTER_KEYS.map((key) => [key, readText(source[key])]).filter(([, value]) => value !== ''),
  );
  const pageSize = Number(source.pageSize);
  return {
    q: readText(source.q),
    filters,
    sort: Object.hasOwn(SORT_COLUMNS, source.sort) ? source.sort : 'name',
    dir: source.dir === 'desc' ? 'desc' : 'asc',
    page: readPage(source.page),
    pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE,
  };
}

/** Accepts "1,2,3" or [1, 2, 3]; returns null when absent and throws-free empty array when nothing valid. */
export function parseIdList(value) {
  if (value === undefined || value === null || value === '') return null;
  const parts = Array.isArray(value) ? value : String(value).split(',');
  const ids = parts
    .map((part) => String(part).trim())
    .filter((part) => /^\d{1,12}$/.test(part))
    .map(Number)
    .filter((id) => id > 0);
  return [...new Set(ids)].slice(0, MAX_IDS);
}
