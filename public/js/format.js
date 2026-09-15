const rupeeFormat = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
const compactRupeeFormat = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 });
const numberFormat = new Intl.NumberFormat('en-IN');

export const formatRupees = (paise) => rupeeFormat.format(Number(paise ?? 0) / 100);
export const formatRupeesCompact = (paise) => compactRupeeFormat.format(Number(paise ?? 0) / 100);
export const formatNumber = (value) => numberFormat.format(Number(value ?? 0));

export function formatDate(isoDate) {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** SQLite datetime('now') values are UTC without a zone marker. */
export function formatTimestamp(value) {
  if (!value) return '';
  const date = new Date(`${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export function ageFrom(isoDate) {
  if (!isoDate) return null;
  const [year, month, day] = isoDate.split('-').map(Number);
  const now = new Date();
  const hadBirthday = now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day);
  return now.getFullYear() - year - (hadBirthday ? 0 : 1);
}

export function formatPhone(phone) {
  if (!phone) return '';
  return /^\d{10}$/.test(phone) ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;
}

export function initials(name) {
  return String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

export function tamilName(list, value) {
  return list.find((item) => item.value === value)?.ta ?? '';
}

export function starOptions(reference, raasi) {
  const allowed = raasi ? new Set(reference.raasis.find((r) => r.value === raasi)?.nakshatras ?? []) : null;
  return reference.nakshatras
    .filter((star) => !allowed || allowed.has(star.value))
    .map((star) => ({ value: star.value, label: `${star.value} · ${star.ta}` }));
}

export const raasiOptions = (reference) => reference.raasis.map((r) => ({ value: r.value, label: `${r.value} · ${r.ta}` }));

export function relationPrefix(gender) {
  if (gender === 'Female') return 'D/o';
  if (gender === 'Male') return 'S/o';
  return 'C/o';
}

export function addressLines(person) {
  const cityLine = [person.city, person.pincode].filter(Boolean).join(' - ');
  return [
    ...String(person.address ?? '').split('\n').filter(Boolean),
    cityLine,
    person.state,
  ].filter(Boolean);
}

export const hasMailingAddress = (person) => Boolean(person.address && person.pincode);

export function toQueryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== null && value !== undefined) search.set(key, String(value));
  }
  return search.toString();
}
