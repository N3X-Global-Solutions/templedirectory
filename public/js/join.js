// Public devotee registration form — the page opened from the link shared on WhatsApp.
// It talks only to /api/public/* and never shows any directory data.
import { watchCreditsBadge } from './creditsBadge.js';
import { emptyState, h, icon } from './dom.js';
import { tamilDate } from './tamilCalendar.js';
import {
  clearErrorsWhileTyping, datalist, familyRow, field, input, missingRequired, readRow, select, starSelects,
  textarea, yesNoField,
} from './views/formControls.js';

const CSRF_HEADERS = Object.freeze({ 'X-Requested-With': 'temple-directory' });
const HONEYPOT_FIELD = 'nickname';
const TOP_LEVEL_FIELDS = [
  'name', 'father_name', 'gender', 'dob', 'occupation', 'phone', 'alt_phone', 'email',
  'address', 'city', 'state', 'pincode', 'native_place', 'raasi', 'natchathram', 'caste', 'gothram',
];

const root = document.getElementById('join');

function linkToken() {
  const fromPath = decodeURIComponent(location.pathname.replace(/^\/join\/?/, '').replace(/\/$/, ''));
  return fromPath || new URLSearchParams(location.search).get('k') || '';
}

async function callApi(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? CSRF_HEADERS : { ...CSRF_HEADERS, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const error = new Error(payload?.error ?? 'Something went wrong. Please try again.');
    error.status = response.status;
    error.details = payload?.details ?? null;
    throw error;
  }
  return payload.data;
}

function page(...children) {
  root.replaceChildren(h('div', { class: 'join__inner' }, ...children));
  window.scrollTo({ top: 0 });
}

function header(temple, subtitle) {
  return h('header', { class: 'join__header' },
    h('span', { class: 'join__om', 'aria-hidden': 'true' }, 'ௐ'),
    h('h1', { class: 'join__temple' }, temple.name),
    h('p', { class: 'join__subtitle' }, subtitle));
}

function linkProblem(message) {
  page(h('section', { class: 'panel panel--padded join__card' },
    emptyState({ mark: 'ௐ', title: 'This form is not available', message })));
}

function thankYou(temple, name, onAddAnother) {
  page(
    header(temple, 'Registration received'),
    h('section', { class: 'panel panel--padded join__card join__thanks' },
      h('div', { class: 'join__tick', 'aria-hidden': 'true' }, icon('check')),
      h('h2', {}, `Nandri, ${name}!`),
      h('p', {}, 'Your details have reached the temple office. They will be added to the temple register shortly.'),
      h('p', { class: 'muted small' }, 'If anything needs correcting, please contact the temple office.'),
      h('button', { type: 'button', class: 'btn btn--gold', onclick: onAddAnother }, icon('plus'), 'Register another family')));
}

function tamilBirthdayPreview(dobInput) {
  const preview = h('p', { class: 'tamil-birthday', 'aria-live': 'polite' });
  const refresh = () => {
    const result = tamilDate(dobInput.value);
    preview.hidden = !result;
    if (!result) return;
    preview.replaceChildren(
      h('span', { class: 'tamil-birthday__label' }, 'Tamil birthday'),
      h('strong', {}, `${result.month.en} ${result.day}`),
      h('span', { class: 'ta' }, `${result.month.ta} ${result.day}`));
  };
  dobInput.addEventListener('input', refresh);
  dobInput.addEventListener('change', refresh);
  refresh();
  return preview;
}

function section(title, ...content) {
  return h('fieldset', { class: 'form-section' }, h('legend', { class: 'section-title' }, title), ...content);
}

function renderForm({ temple, reference }, token) {
  const controls = {
    name: input('name', { maxlength: '100', required: true, autocomplete: 'name' }),
    father_name: input('father_name', { maxlength: '100' }),
    gender: select('gender', reference.genders, { placeholder: 'Select gender' }),
    dob: input('dob', { type: 'date', autocomplete: 'bday' }),
    occupation: input('occupation', { maxlength: '120', placeholder: 'e.g. Farmer, Teacher' }),
    phone: input('phone', { type: 'tel', maxlength: '20', required: true, inputmode: 'tel', autocomplete: 'tel', placeholder: '98765 43210' }),
    alt_phone: input('alt_phone', { type: 'tel', maxlength: '20', inputmode: 'tel' }),
    email: input('email', { type: 'email', maxlength: '120', autocomplete: 'email' }),
    address: textarea('address', { maxlength: '500', rows: '3', placeholder: 'Door no., street, area, landmark' }),
    city: input('city', { maxlength: '120', autocomplete: 'address-level2' }),
    state: input('state', { value: 'Tamil Nadu', maxlength: '120', list: 'state-options' }),
    pincode: input('pincode', { maxlength: '7', inputmode: 'numeric', autocomplete: 'postal-code', placeholder: '6 digits' }),
    native_place: input('native_place', { maxlength: '120' }),
    ...(() => {
      const { raasiSelect, starSelect } = starSelects(reference, '', {});
      return { raasi: raasiSelect, natchathram: starSelect };
    })(),
    caste: input('caste', { maxlength: '120' }),
    gothram: input('gothram', { maxlength: '120' }),
  };

  const questions = {
    hundiyal_wanted: yesNoField('hundiyal_wanted', 'Would you like a hundiyal at home?', { required: true }),
    japa_homa_yearly: yesNoField('japa_homa_yearly', 'Have you performed/participated in the Moolamantra Japa Homa at least once a year?', { required: true }),
    annadhanam_offer: yesNoField('annadhanam_offer', 'Would you like to provide Annadhanam on Amavasai (Pournami)?', { required: true }),
  };
  const dobField = field('Date of birth', controls.dob, { required: true });
  dobField.insertBefore(tamilBirthdayPreview(controls.dob), dobField.querySelector('.field__error'));

  const familyList = h('div', { class: 'repeater__list' });
  const familyEmpty = h('p', { class: 'repeater__empty muted small' }, 'No family members added yet.');
  const syncEmpty = () => { familyEmpty.hidden = familyList.children.length > 0; };
  const addFamilyMember = () => {
    const row = familyRow(reference, {}, syncEmpty);
    familyList.append(row);
    syncEmpty();
    row.querySelector('input')?.focus();
  };
  syncEmpty();

  const formError = h('p', { class: 'join__error', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn--primary btn--block' }, icon('check'), 'Send my details');

  const form = h('form', { class: 'panel panel--padded join__card join__form', novalidate: true },
    section('Your details',
      h('div', { class: 'form-grid form-grid--join' },
        field('Full name', controls.name, { required: true, span: 'span-2' }),
        field("Father's name", controls.father_name, { required: true, span: 'span-2' }),
        field('Gender', controls.gender, { required: true }),
        dobField,
        field('Occupation', controls.occupation, { span: 'span-2' }))),

    section('Contact',
      h('div', { class: 'form-grid form-grid--join' },
        field('Phone number', controls.phone, { required: true, hint: '10-digit mobile number', span: 'span-2' }),
        field('Alternate phone', controls.alt_phone, { span: 'span-2' }),
        field('Email', controls.email, { span: 'full' }))),

    section('Address',
      h('div', { class: 'form-grid form-grid--join' },
        field('Address', controls.address, { required: true, span: 'full' }),
        field('City / Town', controls.city, { required: true }),
        field('State', controls.state, { required: true }),
        field('Pincode', controls.pincode, { required: true }),
        field('Native place', controls.native_place, { hint: 'Ancestral village' }))),

    section('Raasi & lineage',
      h('p', { class: 'form-section__desc muted small' }, 'Used for archanai and sankalpam. Ask an elder in the family if you are not sure.'),
      h('div', { class: 'form-grid form-grid--join' },
        field('Raasi', controls.raasi, { required: true }),
        field('Natchathram', controls.natchathram, { required: true }),
        field('Caste', controls.caste, { required: true }),
        field('Gothram', controls.gothram, { required: true }))),

    section('Family members',
      h('p', { class: 'form-section__desc muted small' }, 'Add everyone in the family who comes for pooja.'),
      familyList, familyEmpty,
      h('p', { class: 'field__error', dataset: { errorFor: 'family_members' } }),
      h('button', { type: 'button', class: 'btn btn--gold repeater__add', onclick: addFamilyMember }, icon('plus'), 'Add family member')),

    section('Temple participation',
      h('div', { class: 'form-grid form-grid--join' },
        questions.hundiyal_wanted.element,
        questions.japa_homa_yearly.element,
        questions.annadhanam_offer.element)),

    // Hidden from people, tempting to bots.
    h('div', { class: 'join__trap', 'aria-hidden': 'true' },
      h('label', { for: 'nickname' }, 'Leave this box empty'),
      h('input', { id: 'nickname', name: HONEYPOT_FIELD, type: 'text', tabindex: '-1', autocomplete: 'off' })),

    formError,
    submit,
    h('p', { class: 'join__privacy muted small' }, 'Your details are kept by the temple office for temple records only.'),
    datalist('state-options', reference.states));

  clearErrorsWhileTyping(form);

  const clearErrors = () => {
    formError.textContent = '';
    form.querySelectorAll('.field__error, [data-row-error]').forEach((slot) => slot.replaceChildren());
    form.querySelectorAll('.has-error').forEach((element) => element.classList.remove('has-error'));
  };

  const showErrors = (details) => {
    const rows = [...familyList.children];
    for (const [key, message] of Object.entries(details ?? {})) {
      const nested = /^family_members\.(\d+)\.(\w+)$/.exec(key);
      const slot = nested
        ? rows[Number(nested[1])]?.querySelector(`[data-row-error="${nested[2]}"]`)
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
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors();
    const values = Object.fromEntries(TOP_LEVEL_FIELDS.map((key) => [key, controls[key].value]));
    const answers = Object.fromEntries(Object.entries(questions).map(([key, question]) => [key, question.getValue()]));
    const missing = missingRequired(values, answers);
    if (Object.keys(missing).length > 0) {
      showErrors(missing);
      formError.textContent = 'Please fill in the fields marked with *.';
      return;
    }

    submit.disabled = true;
    submit.replaceChildren('Sending…');
    try {
      const result = await callApi(`/api/public/registrations?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        body: {
          ...values,
          ...answers,
          family_members: [...familyList.children].map(readRow),
          [HONEYPOT_FIELD]: form.querySelector(`[name="${HONEYPOT_FIELD}"]`).value,
        },
      });
      thankYou(temple, result.name ?? values.name.trim(), () => renderForm({ temple, reference }, token));
    } catch (error) {
      showErrors(error.details);
      formError.textContent = error.message;
      if (!form.querySelector('.has-error')) formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      submit.disabled = false;
      submit.replaceChildren(icon('check'), 'Send my details');
    }
  });

  page(
    header(temple, 'Devotee registration'),
    h('p', { class: 'join__intro' }, 'Please fill in your family details for the temple register. Fields marked * are needed; the rest are optional.'),
    form);
  controls.name.focus({ preventScroll: true });
}

async function start() {
  const token = linkToken();
  if (!token) {
    linkProblem('This link is incomplete. Please use the full link shared by the temple.');
    return;
  }
  try {
    const data = await callApi(`/api/public/form?token=${encodeURIComponent(token)}`);
    document.title = `Devotee registration · ${data.temple.name}`;
    renderForm(data, token);
  } catch (error) {
    linkProblem(error.message);
  }
}

watchCreditsBadge();
start();
