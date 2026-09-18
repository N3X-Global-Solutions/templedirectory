import { h, icon } from '../dom.js';
import { raasiOptions, starOptions } from '../format.js';

let idCounter = 0;
const nextId = (name) => `f-${name.replace(/\W/g, '-')}-${++idCounter}`;

export function input(name, { value = '', type = 'text', ...attrs } = {}) {
  return h('input', { class: 'input', name, id: nextId(name), type, value, ...attrs });
}

export function textarea(name, { value = '', ...attrs } = {}) {
  return h('textarea', { class: 'textarea', name, id: nextId(name), value, ...attrs });
}

export function select(name, options, { value = '', placeholder = 'Select', ...attrs } = {}) {
  const normalized = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const known = normalized.some((o) => o.value === value);
  return h('select', { class: 'select', name, id: nextId(name), ...attrs, value },
    h('option', { value: '' }, placeholder),
    normalized.map((o) => h('option', { value: o.value }, o.label)),
    value && !known ? h('option', { value }, value) : null);
}

export function datalist(id, values) {
  return h('datalist', { id }, values.map((v) => h('option', { value: v })));
}

/** Wraps a control with label, hint and an error slot keyed by the API field path. */
export function field(label, control, { required = false, hint = '', span = '', errorKey = control.name } = {}) {
  return h('div', { class: `field${span ? ` field--${span}` : ''}` },
    h('label', { class: 'field__label', for: control.id }, label, required ? h('span', { class: 'req', 'aria-hidden': 'true' }, '*') : null),
    control,
    hint ? h('p', { class: 'field__hint' }, hint) : null,
    h('p', { class: 'field__error', dataset: { errorFor: errorKey }, 'aria-live': 'polite' }));
}

/** Keeps the natchathram list limited to stars that fall in the chosen raasi. */
export function linkStarSelects(reference, raasiSelect, starSelect) {
  const refill = () => {
    const current = starSelect.value;
    const options = starOptions(reference, raasiSelect.value);
    starSelect.replaceChildren(
      h('option', { value: '' }, raasiSelect.value ? 'Select natchathram' : 'Select (or pick raasi first)'),
      ...options.map((o) => h('option', { value: o.value }, o.label)),
    );
    starSelect.value = options.some((o) => o.value === current) ? current : '';
  };
  raasiSelect.addEventListener('change', refill);
  refill();
}

export function starSelects(reference, prefix, { raasi = '', natchathram = '' } = {}) {
  const raasiSelect = select(`${prefix}raasi`, raasiOptions(reference), { value: raasi, placeholder: 'Select raasi' });
  const starSelect = select(`${prefix}natchathram`, starOptions(reference, ''), { value: natchathram, placeholder: 'Select natchathram' });
  linkStarSelects(reference, raasiSelect, starSelect);
  starSelect.value = natchathram;
  return { raasiSelect, starSelect };
}

function removeButton(label, row, onRemove) {
  return h('button', {
    type: 'button', class: 'btn btn--icon btn--sm btn--danger repeater__remove', 'aria-label': label, title: label,
    onclick: () => {
      row.remove();
      onRemove();
    },
  }, icon('trash'));
}

function cell(label, control, key) {
  return h('div', { class: 'repeater__cell' },
    h('label', { class: 'repeater__label', for: control.id }, label),
    control,
    h('p', { class: 'field__error', dataset: { rowError: key } }));
}

export function familyRow(reference, member = {}, onChange = () => {}) {
  const row = h('div', { class: 'repeater__row repeater__row--family', dataset: { kind: 'family' } });
  const { raasiSelect, starSelect } = starSelects(reference, '', member);
  row.append(
    cell('Name', input('name', { value: member.name ?? '', maxlength: '100', placeholder: 'Full name' }), 'name'),
    cell('Relation', select('relation', reference.relations, { value: member.relation ?? '', placeholder: 'Relation' }), 'relation'),
    cell('Phone', input('phone', { type: 'tel', value: member.phone ?? '', maxlength: '20', inputmode: 'tel', placeholder: 'Optional' }), 'phone'),
    cell('Raasi', raasiSelect, 'raasi'),
    cell('Natchathram', starSelect, 'natchathram'),
    removeButton('Remove family member', row, onChange),
  );
  return row;
}

const rupeesFromPaise = (paise) => (paise ? (paise / 100).toFixed(2).replace(/\.00$/, '') : '');
const todayIso = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export function donationRow(reference, donation = {}, onChange = () => {}) {
  const row = h('div', { class: 'repeater__row repeater__row--donation', dataset: { kind: 'donation' } });
  row.append(
    cell('Date', input('donated_on', { type: 'date', value: donation.donated_on ?? todayIso(), max: todayIso() }), 'donated_on'),
    cell('Amount (₹)', input('amount', { value: rupeesFromPaise(donation.amount_paise), inputmode: 'decimal', placeholder: '1001' }), 'amount'),
    cell('Purpose', input('purpose', { value: donation.purpose ?? '', list: 'donation-purposes', maxlength: '100', placeholder: 'Annadhanam' }), 'purpose'),
    cell('Mode', select('mode', reference.donationModes, { value: donation.mode ?? '', placeholder: 'Mode' }), 'mode'),
    cell('Receipt no.', input('receipt_no', { value: donation.receipt_no ?? '', maxlength: '40' }), 'receipt_no'),
    removeButton('Remove donation', row, onChange),
  );
  return row;
}

/** Two-button Yes/No radio group. Returns { element, getValue }. */
export function yesNoField(name, label, { value = false, hint = '' } = {}) {
  const labelId = nextId(`${name}-label`);
  const option = (answer, text) => {
    const id = nextId(`${name}-${answer}`);
    return h('span', { class: 'yes-no__option' },
      h('input', { type: 'radio', name, id, value: answer, checked: (answer === 'yes') === Boolean(value) }),
      h('label', { for: id }, text));
  };
  const group = h('div', { class: 'yes-no', role: 'radiogroup', 'aria-labelledby': labelId },
    option('yes', 'Yes'), option('no', 'No'));
  const element = h('div', { class: 'field' },
    h('span', { class: 'field__label', id: labelId }, label),
    group,
    hint ? h('p', { class: 'field__hint' }, hint) : null,
    h('p', { class: 'field__error', dataset: { errorFor: name }, 'aria-live': 'polite' }));
  return { element, getValue: () => group.querySelector('input:checked')?.value === 'yes' };
}

export function readRow(row) {
  return Object.fromEntries([...row.querySelectorAll('input, select')].map((control) => [control.name, control.value]));
}
