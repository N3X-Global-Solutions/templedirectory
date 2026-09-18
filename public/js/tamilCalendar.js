// Tamil solar calendar from a Gregorian date. Pure functions — used by the browser and the server.
//
// A Tamil month begins when the Sun enters the next sidereal rasi (sankranti). Tamil
// convention: if that happens before sunset, the same day is day 1; otherwise the next day.
// So the month of a day is the rasi the Sun is in at that day's sunset.
// Sun position: Meeus, "Astronomical Algorithms" ch. 25 (≈0.01°, i.e. ~15 minutes of time).
// Sidereal zodiac: Lahiri (Chitrapaksha) ayanamsa, as used by Tamil panchangams.

export const TAMIL_MONTHS = Object.freeze([
  { en: 'Chithirai', ta: 'சித்திரை' },
  { en: 'Vaikasi', ta: 'வைகாசி' },
  { en: 'Aani', ta: 'ஆனி' },
  { en: 'Aadi', ta: 'ஆடி' },
  { en: 'Aavani', ta: 'ஆவணி' },
  { en: 'Purattasi', ta: 'புரட்டாசி' },
  { en: 'Aippasi', ta: 'ஐப்பசி' },
  { en: 'Karthigai', ta: 'கார்த்திகை' },
  { en: 'Margazhi', ta: 'மார்கழி' },
  { en: 'Thai', ta: 'தை' },
  { en: 'Maasi', ta: 'மாசி' },
  { en: 'Panguni', ta: 'பங்குனி' },
]);

// 60-year cycle; index 0 (Prabhava) began on Chithirai 1, 1987.
export const TAMIL_YEARS = Object.freeze([
  ['Prabhava', 'பிரபவ'], ['Vibhava', 'விபவ'], ['Sukla', 'சுக்ல'], ['Pramodhootha', 'பிரமோதூத'],
  ['Prajorpaththi', 'பிரஜோத்பத்தி'], ['Aangirasa', 'ஆங்கீரச'], ['Srimukha', 'ஸ்ரீமுக'], ['Bhava', 'பவ'],
  ['Yuva', 'யுவ'], ['Dhaathu', 'தாது'], ['Eeswara', 'ஈஸ்வர'], ['Vehudhanya', 'வெகுதானிய'],
  ['Pramaathi', 'பிரமாதி'], ['Vikrama', 'விக்கிரம'], ['Vishu', 'விஷு'], ['Chitrabhanu', 'சித்திரபானு'],
  ['Subhanu', 'சுபானு'], ['Dhaarana', 'தாரண'], ['Paarthiba', 'பார்த்திப'], ['Viya', 'விய'],
  ['Sarvajith', 'சர்வசித்து'], ['Sarvadhaari', 'சர்வதாரி'], ['Virodhi', 'விரோதி'], ['Vikruthi', 'விக்ருதி'],
  ['Kara', 'கர'], ['Nandhana', 'நந்தன'], ['Vijaya', 'விஜய'], ['Jaya', 'ஜய'],
  ['Manmatha', 'மன்மத'], ['Dhurmukhi', 'துன்முகி'], ['Hevilambi', 'ஹேவிளம்பி'], ['Vilambi', 'விளம்பி'],
  ['Vikaari', 'விகாரி'], ['Saarvari', 'சார்வரி'], ['Plava', 'பிலவ'], ['Subakruthu', 'சுபகிருது'],
  ['Sobakruthu', 'சோபகிருது'], ['Krodhi', 'குரோதி'], ['Visuvaavasu', 'விசுவாவசு'], ['Parabhava', 'பராபவ'],
  ['Plavanga', 'பிலவங்க'], ['Keelaka', 'கீலக'], ['Saumya', 'சௌமிய'], ['Sadharana', 'சாதாரண'],
  ['Virodhikruthu', 'விரோதகிருது'], ['Paridhaabi', 'பரிதாபி'], ['Pramaadhisa', 'பிரமாதீச'], ['Aanandha', 'ஆனந்த'],
  ['Rakshasa', 'ராட்சச'], ['Nala', 'நள'], ['Pingala', 'பிங்கள'], ['Kaalayukthi', 'காளயுக்தி'],
  ['Siddharthi', 'சித்தார்த்தி'], ['Raudhri', 'ரௌத்திரி'], ['Dhunmathi', 'துன்மதி'], ['Dhundubhi', 'துந்துபி'],
  ['Rudhirodhgaari', 'ருத்ரோத்காரி'], ['Raktaakshi', 'ரக்தாட்சி'], ['Krodhana', 'குரோதன'], ['Akshaya', 'அட்சய'],
].map(([en, ta]) => Object.freeze({ en, ta })));

const CYCLE_START_YEAR = 1987;
// Central Tamil Nadu; sunset differs by only a few minutes across the state.
const LATITUDE_DEG = 11.0;
const LONGITUDE_DEG = 78.7;
const MS_PER_DAY = 86_400_000;
const MAX_MONTH_LENGTH = 32;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;
const normalize360 = (deg) => ((deg % 360) + 360) % 360;
const normalize180 = (deg) => normalize360(deg + 180) - 180;

function sunAt(timestampMs) {
  const julianDay = timestampMs / MS_PER_DAY + 2440587.5;
  const t = (julianDay - 2451545.0) / 36525;
  const meanLongitude = normalize360(280.46646 + 36000.76983 * t + 0.0003032 * t * t);
  const meanAnomaly = toRad(357.52911 + 35999.05029 * t - 0.0001537 * t * t);
  const center = (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(meanAnomaly)
    + (0.019993 - 0.000101 * t) * Math.sin(2 * meanAnomaly)
    + 0.000289 * Math.sin(3 * meanAnomaly);
  const omega = toRad(125.04 - 1934.136 * t);
  const apparentLongitude = meanLongitude + center - 0.00569 - 0.00478 * Math.sin(omega);
  const obliquity = toRad(23.439291 - 0.0130042 * t + 0.00256 * Math.cos(omega));
  const lambda = toRad(apparentLongitude);
  const rightAscension = normalize360(toDeg(Math.atan2(Math.cos(obliquity) * Math.sin(lambda), Math.cos(lambda))));
  // Lahiri ayanamsa: 23°51'25.5" at J2000 (Swiss Ephemeris SE_SIDM_LAHIRI), precessing ~50.28"/year.
  const lahiriAyanamsa = 23.857092 + 1.396971 * t;

  return {
    siderealLongitude: normalize360(apparentLongitude - lahiriAyanamsa),
    declination: Math.asin(Math.sin(obliquity) * Math.sin(lambda)),
    equationOfTimeMinutes: 4 * normalize180(meanLongitude - 0.0057183 - rightAscension),
  };
}

/** UTC timestamp of sunset on the given UTC calendar day at the reference location. */
function sunsetMs(dayStartUtcMs) {
  const sunsetFor = (sun) => {
    const lat = toRad(LATITUDE_DEG);
    const cosHourAngle = (Math.sin(toRad(-0.833)) - Math.sin(lat) * Math.sin(sun.declination))
      / (Math.cos(lat) * Math.cos(sun.declination));
    const hourAngle = toDeg(Math.acos(Math.min(1, Math.max(-1, cosHourAngle))));
    const solarNoonMinutes = 720 - 4 * LONGITUDE_DEG - sun.equationOfTimeMinutes;
    return dayStartUtcMs + (solarNoonMinutes + 4 * hourAngle) * 60_000;
  };
  // Two passes: estimate with the Sun at local noon, then refine with the Sun at that sunset.
  const firstGuess = sunsetFor(sunAt(dayStartUtcMs + 7 * 3_600_000));
  return sunsetFor(sunAt(firstGuess));
}

const rasiIndexOn = (dayStartUtcMs) => Math.floor(sunAt(sunsetMs(dayStartUtcMs)).siderealLongitude / 30);

function parseIsoDate(value) {
  const match = typeof value === 'string' ? DATE_PATTERN.exec(value) : null;
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const ms = Date.UTC(year, month - 1, day);
  const date = new Date(ms);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, ms };
}

/**
 * Tamil calendar date for an ISO date string (YYYY-MM-DD).
 * Returns { month: {en, ta}, day, year: {en, ta} } or null for invalid input.
 * The month is reliable; the day number can differ by one from a printed panchangam
 * only when the sankranti falls within minutes of sunset.
 */
export function tamilDate(isoDate) {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return null;

  const rasi = rasiIndexOn(parsed.ms);
  let daysIntoMonth = 0;
  while (daysIntoMonth < MAX_MONTH_LENGTH && rasiIndexOn(parsed.ms - (daysIntoMonth + 1) * MS_PER_DAY) === rasi) {
    daysIntoMonth += 1;
  }

  // Chithirai (0) … Margazhi (8) from April onwards belong to the Tamil year starting that April;
  // everything else (Margazhi in January, Thai, Maasi, Panguni) belongs to the previous one.
  const startYear = parsed.month >= 4 && rasi <= 8 ? parsed.year : parsed.year - 1;
  const cycleIndex = (((startYear - CYCLE_START_YEAR) % 60) + 60) % 60;

  return { month: TAMIL_MONTHS[rasi], day: daysIntoMonth + 1, year: TAMIL_YEARS[cycleIndex] };
}

/** "Maasi 5 · மாசி 5 · Vishu year" — or '' when the date is missing/invalid. */
export function formatTamilDate(isoDate) {
  const result = tamilDate(isoDate);
  if (!result) return '';
  return `${result.month.en} ${result.day} · ${result.month.ta} ${result.day} · ${result.year.en} (${result.year.ta}) year`;
}
