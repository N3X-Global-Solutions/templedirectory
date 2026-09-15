// Reference data shared by validation (server) and form options (client via /api/session).

export const RAASIS = Object.freeze([
  { value: 'Mesham', ta: 'மேஷம்', nakshatras: ['Ashwini', 'Bharani', 'Karthigai'] },
  { value: 'Rishabam', ta: 'ரிஷபம்', nakshatras: ['Karthigai', 'Rohini', 'Mirugasheerisham'] },
  { value: 'Mithunam', ta: 'மிதுனம்', nakshatras: ['Mirugasheerisham', 'Thiruvathirai', 'Punarpoosam'] },
  { value: 'Kadagam', ta: 'கடகம்', nakshatras: ['Punarpoosam', 'Poosam', 'Ayilyam'] },
  { value: 'Simmam', ta: 'சிம்மம்', nakshatras: ['Magam', 'Pooram', 'Uthiram'] },
  { value: 'Kanni', ta: 'கன்னி', nakshatras: ['Uthiram', 'Hastham', 'Chithirai'] },
  { value: 'Thulam', ta: 'துலாம்', nakshatras: ['Chithirai', 'Swathi', 'Visakam'] },
  { value: 'Viruchigam', ta: 'விருச்சிகம்', nakshatras: ['Visakam', 'Anusham', 'Kettai'] },
  { value: 'Dhanusu', ta: 'தனுசு', nakshatras: ['Moolam', 'Pooradam', 'Uthiradam'] },
  { value: 'Magaram', ta: 'மகரம்', nakshatras: ['Uthiradam', 'Thiruvonam', 'Avittam'] },
  { value: 'Kumbam', ta: 'கும்பம்', nakshatras: ['Avittam', 'Sadhayam', 'Poorattathi'] },
  { value: 'Meenam', ta: 'மீனம்', nakshatras: ['Poorattathi', 'Uthirattathi', 'Revathi'] },
]);

export const NAKSHATRAS = Object.freeze([
  { value: 'Ashwini', ta: 'அஸ்வினி' },
  { value: 'Bharani', ta: 'பரணி' },
  { value: 'Karthigai', ta: 'கார்த்திகை' },
  { value: 'Rohini', ta: 'ரோகிணி' },
  { value: 'Mirugasheerisham', ta: 'மிருகசீரிடம்' },
  { value: 'Thiruvathirai', ta: 'திருவாதிரை' },
  { value: 'Punarpoosam', ta: 'புனர்பூசம்' },
  { value: 'Poosam', ta: 'பூசம்' },
  { value: 'Ayilyam', ta: 'ஆயில்யம்' },
  { value: 'Magam', ta: 'மகம்' },
  { value: 'Pooram', ta: 'பூரம்' },
  { value: 'Uthiram', ta: 'உத்திரம்' },
  { value: 'Hastham', ta: 'அஸ்தம்' },
  { value: 'Chithirai', ta: 'சித்திரை' },
  { value: 'Swathi', ta: 'சுவாதி' },
  { value: 'Visakam', ta: 'விசாகம்' },
  { value: 'Anusham', ta: 'அனுஷம்' },
  { value: 'Kettai', ta: 'கேட்டை' },
  { value: 'Moolam', ta: 'மூலம்' },
  { value: 'Pooradam', ta: 'பூராடம்' },
  { value: 'Uthiradam', ta: 'உத்திராடம்' },
  { value: 'Thiruvonam', ta: 'திருவோணம்' },
  { value: 'Avittam', ta: 'அவிட்டம்' },
  { value: 'Sadhayam', ta: 'சதயம்' },
  { value: 'Poorattathi', ta: 'பூரட்டாதி' },
  { value: 'Uthirattathi', ta: 'உத்திரட்டாதி' },
  { value: 'Revathi', ta: 'ரேவதி' },
]);

export const GENDERS = Object.freeze(['Male', 'Female', 'Other']);

export const MEMBER_TYPES = Object.freeze(['Devotee', 'Donor', 'Trustee', 'Volunteer']);

export const RELATIONS = Object.freeze([
  'Wife', 'Husband', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister',
  'Grandson', 'Granddaughter', 'Daughter-in-law', 'Son-in-law', 'Grandfather', 'Grandmother', 'Other',
]);

export const DONATION_MODES = Object.freeze(['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other']);

export const DONATION_PURPOSES = Object.freeze([
  'General', 'Annadhanam', 'Abhishekam', 'Archanai', 'Thiruvizha / Festival',
  'Kumbabishekam', 'Temple Renovation', 'Pongal Offering',
]);

export const INDIAN_STATES = Object.freeze([
  'Tamil Nadu', 'Puducherry', 'Kerala', 'Karnataka', 'Andhra Pradesh', 'Telangana',
  'Andaman and Nicobar Islands', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jammu and Kashmir', 'Jharkhand', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
]);

const STARS_BY_RAASI = new Map(RAASIS.map((raasi) => [raasi.value, new Set(raasi.nakshatras)]));

/** A natchathram spans parts of up to two raasis; reject combinations that cannot occur. */
export function isCompatibleStar(raasi, nakshatra) {
  const stars = STARS_BY_RAASI.get(raasi);
  return Boolean(stars && stars.has(nakshatra));
}

export function referenceData() {
  return {
    raasis: RAASIS,
    nakshatras: NAKSHATRAS,
    genders: GENDERS,
    memberTypes: MEMBER_TYPES,
    relations: RELATIONS,
    donationModes: DONATION_MODES,
    donationPurposes: DONATION_PURPOSES,
    states: INDIAN_STATES,
  };
}
