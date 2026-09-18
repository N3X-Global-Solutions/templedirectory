import { api } from '../api.js';
import { debounce, h, icon, toast } from '../dom.js';
import { formatPhone } from '../format.js';
import { tamilDate } from '../tamilCalendar.js';
import {
  datalist, donationRow, familyRow, field, input, readRow, select, starSelects, textarea, yesNoField,
} from './formControls.js';

const PHONE_CHECK_DELAY_MS = 400;
const TOP_LEVEL_FIELDS = [
  'name', 'father_name', 'gender', 'dob', 'member_type', 'occupation', 'phone', 'alt_phone', 'email', 'address',
  'city', 'state', 'pincode', 'native_place', 'raasi', 'natchathram', 'caste', 'gothram', 'notes',
];

/** Live "Tamil birthday" line under the date-of-birth field. */
function tamilBirthdayPreview(dobInput) {
  const preview = h('p', { class: 'tamil-birthday', 'aria-live': 'polite' });
  const refresh = () => {
    const result = tamilDate(dobInput.value);
    preview.hidden = !result;
    if (!result) return;
    preview.replaceChildren(
      h('span', { class: 'tamil-birthday__label' }, 'Tamil birthday'),
      h('strong', {}, `${result.month.en} ${result.day}`),
      h('span', { class: 'ta' }, `${result.month.ta} ${result.day}`),
      h('span', { class: 'tamil-birthday__year' }, `${result.year.en} (${result.year.ta}) year`));
  };
  dobInput.addEventListener('input', refresh);
  dobInput.addEventListener('change', refresh);
  refresh();
  return preview;
}

function section(title, description, ...content) {
  return h('fieldset', { class: 'form-section' },
    h('legend', { class: 'section-title' }, title),
    description ? h('p', { class: 'form-section__desc muted small' }, description) : null,
    ...content);
}

export async function renderDevoteeForm(ctx, id) {
  const { reference } = ctx.session;
  const existing = id ? (await api.get(`/devotees/${id}`)).data : null;
  const facets = (await api.get('/facets')).data;
  if (!ctx.isCurrent()) return null;

  const person = existing ?? { member_type: 'Devotee', state: 'Tamil Nadu', family_members: [], donations: [] };
  ctx.setTitle(existing ? `Edit ${existing.name}` : 'Add devotee');

  const { raasiSelect, starSelect } = starSelects(reference, '', person);
  const controls = {
    name: input('name', { value: person.name ?? '', maxlength: '100', required: true, autocomplete: 'off' }),
    father_name: input('father_name', { value: person.father_name ?? '', maxlength: '100' }),
    gender: select('gender', reference.genders, { value: person.gender ?? '', placeholder: 'Select gender' }),
    dob: input('dob', { type: 'date', value: person.dob ?? '' }),
    member_type: select('member_type', reference.memberTypes, { value: person.member_type ?? 'Devotee', placeholder: 'Select type' }),
    occupation: input('occupation', { value: person.occupation ?? '', maxlength: '120', list: 'occupation-options', placeholder: 'e.g. Farmer, Teacher' }),
    phone: input('phone', { type: 'tel', value: person.phone ?? '', maxlength: '20', required: true, inputmode: 'tel', placeholder: '98765 43210' }),
    alt_phone: input('alt_phone', { type: 'tel', value: person.alt_phone ?? '', maxlength: '20', inputmode: 'tel' }),
    email: input('email', { type: 'email', value: person.email ?? '', maxlength: '120' }),
    address: textarea('address', { value: person.address ?? '', maxlength: '500', rows: '3', placeholder: 'Door no., street, area, landmark' }),
    city: input('city', { value: person.city ?? '', maxlength: '120', list: 'city-options' }),
    state: input('state', { value: person.state ?? '', maxlength: '120', list: 'state-options' }),
    pincode: input('pincode', { value: person.pincode ?? '', maxlength: '7', inputmode: 'numeric', placeholder: '6 digits' }),
    native_place: input('native_place', { value: person.native_place ?? '', maxlength: '120' }),
    raasi: raasiSelect,
    natchathram: starSelect,
    caste: input('caste', { value: person.caste ?? '', maxlength: '120', list: 'caste-options' }),
    gothram: input('gothram', { value: person.gothram ?? '', maxlength: '120', list: 'gothram-options' }),
    notes: textarea('notes', { value: person.notes ?? '', maxlength: '2000', rows: '3', placeholder: 'Special poojas, preferences, anything worth remembering' }),
  };

  const hundiyal = yesNoField('hundiyal_wanted', 'Hundiyal wanted', {
    value: person.hundiyal_wanted ?? false,
    hint: 'Would this family like a hundiyal to keep at home?',
  });
  const dobField = field('Date of birth', controls.dob);
  dobField.insertBefore(tamilBirthdayPreview(controls.dob), dobField.querySelector('.field__error'));

  const familyList = h('div', { class: 'repeater__list' });
  const donationList = h('div', { class: 'repeater__list' });
  const familyEmpty = h('p', { class: 'repeater__empty muted small' }, 'No family members added yet.');
  const donationEmpty = h('p', { class: 'repeater__empty muted small' }, 'No donations recorded yet.');
  const syncEmpty = () => {
    familyEmpty.hidden = familyList.children.length > 0;
    donationEmpty.hidden = donationList.children.length > 0;
  };
  person.family_members.forEach((m) => familyList.append(familyRow(reference, m, syncEmpty)));
  person.donations.forEach((d) => donationList.append(donationRow(reference, d, syncEmpty)));
  syncEmpty();

  const addFamily = () => {
    const row = familyRow(reference, {}, syncEmpty);
    familyList.append(row);
    syncEmpty();
    row.querySelector('input').focus();
  };
  const addDonation = () => {
    const row = donationRow(reference, {}, syncEmpty);
    donationList.append(row);
    syncEmpty();
    row.querySelector('input[name="amount"]').focus();
  };

  const saveButton = h('button', { type: 'submit', class: 'btn btn--primary' }, icon('check'), existing ? 'Save changes' : 'Add to directory');
  const cancelHref = existing ? `#/devotees/${existing.id}` : '#/directory';

  const form = h('form', { class: 'panel devotee-form', novalidate: true },
    h('header', { class: 'devotee-form__head' },
      h('p', { class: 'eyebrow' }, existing ? `Editing record #${existing.id}` : 'New registration'),
      h('h1', { class: 'page-title' }, existing ? existing.name : 'Add a devotee'),
      h('p', { class: 'muted' }, 'Fields marked ', h('span', { class: 'req' }, '*'), ' are required. Everything else can be filled in later.')),

    section('Personal details', '',
      h('div', { class: 'form-grid' },
        field('Full name', controls.name, { required: true, span: 'span-2' }),
        field("Father's name", controls.father_name, { span: 'span-2' }),
        field('Gender', controls.gender),
        dobField,
        field('Member type', controls.member_type),
        field('Occupation', controls.occupation),
        hundiyal.element)),

    section('Contact', 'Each phone number can belong to only one devotee.',
      h('div', { class: 'form-grid' },
        field('Phone number', controls.phone, { required: true, hint: '10-digit mobile, or +country code' }),
        field('Alternate phone', controls.alt_phone),
        field('Email', controls.email, { span: 'span-2' }))),

    section('Address', 'Used for festival invitations and prasadam posting.',
      h('div', { class: 'form-grid' },
        field('Address', controls.address, { span: 'full' }),
        field('City / Town', controls.city),
        field('State', controls.state),
        field('Pincode', controls.pincode),
        field('Native place', controls.native_place, { hint: 'Ancestral village' }))),

    section('Raasi, natchathram & lineage', 'Choosing a raasi narrows the natchathram list to stars that fall in it.',
      h('div', { class: 'form-grid' },
        field('Raasi', controls.raasi),
        field('Natchathram', controls.natchathram),
        field('Caste', controls.caste),
        field('Gothram', controls.gothram))),

    section('Family members', 'Add spouse, children and others who come for pooja with this family.',
      familyList, familyEmpty,
      h('p', { class: 'field__error', dataset: { errorFor: 'family_members' } }),
      h('button', { type: 'button', class: 'btn btn--gold repeater__add', onclick: addFamily }, icon('plus'), 'Add family member')),

    section('Donations', 'Record offerings with receipt numbers for easy reconciliation.',
      donationList, donationEmpty,
      h('p', { class: 'field__error', dataset: { errorFor: 'donations' } }),
      h('button', { type: 'button', class: 'btn btn--gold repeater__add', onclick: addDonation }, icon('plus'), 'Add donation')),

    section('Notes', '', field('Notes', controls.notes, { span: 'full' })),

    h('div', { class: 'devotee-form__actions' },
      h('a', { class: 'btn btn--ghost', href: cancelHref }, 'Cancel'),
      saveButton),

    datalist('city-options', facets.cities),
    datalist('state-options', reference.states),
    datalist('caste-options', facets.castes),
    datalist('gothram-options', facets.gothrams),
    datalist('occupation-options', facets.occupations),
    datalist('donation-purposes', reference.donationPurposes));

  const phoneError = () => form.querySelector('[data-error-for="phone"]');

  const checkPhone = debounce(async () => {
    const value = controls.phone.value.trim();
    if (value.replace(/\D/g, '').length < 10) return;
    try {
      const params = new URLSearchParams({ phone: value });
      if (existing) params.set('excludeId', String(existing.id));
      const { data } = await api.get(`/devotees/phone-check?${params}`);
      if (controls.phone.value.trim() !== value) return;
      const slot = phoneError();
      if (data.available) {
        slot.replaceChildren();
        slot.closest('.field').classList.remove('has-error');
      } else {
        slot.replaceChildren(`${formatPhone(data.phone)} is already registered to `, h('a', { href: `#/devotees/${data.existing.id}` }, data.existing.name), '.');
        slot.closest('.field').classList.add('has-error');
      }
    } catch {
      // Invalid format — the server reports it properly on save.
    }
  }, PHONE_CHECK_DELAY_MS);
  controls.phone.addEventListener('input', checkPhone);

  function clearErrors() {
    form.querySelectorAll('.field__error').forEach((slot) => slot.replaceChildren());
    form.querySelectorAll('.has-error').forEach((el) => el.classList.remove('has-error'));
  }

  function showErrors(errors) {
    const familyRows = [...familyList.children];
    const donationRows = [...donationList.children];
    for (const [key, message] of Object.entries(errors)) {
      const nested = /^(family_members|donations)\.(\d+)\.(\w+)$/.exec(key);
      const rows = nested ? (nested[1] === 'family_members' ? familyRows : donationRows) : null;
      const slot = nested
        ? rows[Number(nested[2])]?.querySelector(`[data-row-error="${nested[3]}"]`)
        : form.querySelector(`[data-error-for="${CSS.escape(key)}"]`);
      if (!slot) continue;
      slot.textContent = message;
      slot.parentElement.classList.add('has-error');
    }
    const first = form.querySelector('.has-error');
    if (first) {
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      first.querySelector('input, select, textarea')?.focus({ preventScroll: true });
    }
  }

  function collect() {
    const values = Object.fromEntries(TOP_LEVEL_FIELDS.map((key) => [key, controls[key].value]));
    return {
      ...values,
      hundiyal_wanted: hundiyal.getValue(),
      ...(existing ? { version: existing.version } : {}),
      family_members: [...familyList.children].map(readRow),
      donations: [...donationList.children].map(readRow),
    };
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    checkPhone.cancel();
    clearErrors();
    const payload = collect();
    const missing = {
      ...(payload.name.trim() ? {} : { name: 'Name is required' }),
      ...(payload.phone.trim() ? {} : { phone: 'Phone number is required' }),
    };
    if (Object.keys(missing).length > 0) {
      showErrors(missing);
      return;
    }

    saveButton.disabled = true;
    try {
      const { data } = existing
        ? await api.put(`/devotees/${existing.id}`, payload)
        : await api.post('/devotees', payload);
      toast(existing ? 'Changes saved.' : `${data.name} has been added to the directory.`, 'success');
      ctx.navigate(`#/devotees/${data.id}`);
    } catch (error) {
      if (error.details) showErrors(error.details);
      toast(error.message, 'error');
    } finally {
      saveButton.disabled = false;
    }
  });

  ctx.root.replaceChildren(
    h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, h('a', { href: cancelHref }, icon('back'), existing ? 'Back to record' : 'Back to directory')),
    form);
  controls.name.focus();
  return () => checkPhone.cancel();
}
