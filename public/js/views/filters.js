import { h, icon } from '../dom.js';
import { raasiOptions, starOptions } from '../format.js';

export const FILTER_KEYS = [
  'gender', 'memberType', 'raasi', 'natchathram', 'state', 'city', 'caste', 'gothram', 'occupation', 'hundiyal', 'donations',
];

const plain = (values) => values.map((value) => ({ value, label: value }));
const YES_NO_LABELS = Object.freeze({
  hundiyal: { yes: 'Wants hundiyal', no: 'No hundiyal' },
  donations: { yes: 'Has donated', no: 'No donations yet' },
});
const yesNoOptions = (key) => Object.entries(YES_NO_LABELS[key]).map(([value, label]) => ({ value, label }));

const FILTER_DEFS = [
  { key: 'raasi', label: 'Raasi', options: ({ reference }) => raasiOptions(reference) },
  { key: 'natchathram', label: 'Natchathram', options: ({ reference, values }) => starOptions(reference, values.raasi) },
  { key: 'gender', label: 'Gender', options: ({ reference }) => plain(reference.genders) },
  { key: 'memberType', label: 'Member type', options: ({ reference }) => plain(reference.memberTypes) },
  { key: 'city', label: 'City', options: ({ facets }) => plain(facets.cities) },
  { key: 'state', label: 'State', options: ({ facets }) => plain(facets.states) },
  { key: 'caste', label: 'Caste', options: ({ facets }) => plain(facets.castes) },
  { key: 'gothram', label: 'Gothram', options: ({ facets }) => plain(facets.gothrams) },
  { key: 'occupation', label: 'Occupation', options: ({ facets }) => plain(facets.occupations) },
  { key: 'hundiyal', label: 'Hundiyal', options: () => yesNoOptions('hundiyal') },
  { key: 'donations', label: 'Donations', options: () => yesNoOptions('donations') },
];

const LABELS = Object.fromEntries(FILTER_DEFS.map((def) => [def.key, def.label]));

export function readFilters(query) {
  return Object.fromEntries(FILTER_KEYS.map((key) => [key, query.get(key) ?? '']).filter(([, value]) => value));
}

function fillOptions(select, options, value) {
  const hasValue = options.some((option) => option.value === value);
  select.replaceChildren(
    h('option', { value: '' }, 'Any'),
    ...options.map((option) => h('option', { value: option.value }, option.label)),
    value && !hasValue ? h('option', { value }, value) : null,
  );
  select.value = value ?? '';
}

/**
 * Filter panel shared by the directory and mailing views.
 * onChange receives a fresh filters object each time.
 */
export function createFilterPanel({ reference, facets, values, onChange }) {
  let current = { ...values };
  const selects = new Map();

  const grid = h('div', { class: 'filters__grid' }, FILTER_DEFS.map((def) => {
    const id = `filter-${def.key}-${Math.random().toString(36).slice(2, 7)}`;
    const select = h('select', {
      class: 'select', id, name: def.key,
      onchange: () => update({ ...current, [def.key]: select.value }),
    });
    selects.set(def.key, select);
    return h('div', { class: 'field' }, h('label', { class: 'field__label', for: id }, def.label), select);
  }));

  function render() {
    for (const def of FILTER_DEFS) {
      fillOptions(selects.get(def.key), def.options({ reference, facets, values: current }), current[def.key] ?? '');
    }
  }

  function update(next) {
    const raasiChanged = next.raasi !== current.raasi;
    const stars = starOptions(reference, next.raasi).map((s) => s.value);
    const withoutStale = raasiChanged && next.natchathram && !stars.includes(next.natchathram)
      ? { ...next, natchathram: '' }
      : next;
    current = Object.fromEntries(Object.entries(withoutStale).filter(([, value]) => value));
    render();
    onChange({ ...current });
  }

  const element = h('div', { class: 'filters', hidden: true },
    grid,
    h('div', { class: 'filters__footer' },
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => update({}) }, icon('close'), 'Clear all filters')));

  render();

  return {
    element,
    setValues(next) {
      current = { ...next };
      render();
    },
  };
}

export function filterChips(values, onRemove) {
  const entries = Object.entries(values).filter(([, value]) => value);
  if (entries.length === 0) return null;
  return h('div', { class: 'active-filters', 'aria-label': 'Active filters' },
    entries.map(([key, value]) => h('span', { class: 'chip' },
      h('span', {}, `${LABELS[key] ?? key}: ${YES_NO_LABELS[key]?.[value] ?? value}`),
      h('button', { type: 'button', 'aria-label': `Remove ${LABELS[key]} filter`, onclick: () => onRemove(key) }, icon('close')))));
}

export function filterToggleButton(panel, count) {
  const button = h('button', {
    type: 'button', class: 'btn', 'aria-expanded': 'false',
    onclick: () => {
      const open = panel.element.hidden;
      panel.element.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    },
  }, icon('filter'), 'Filters');
  const pill = h('span', { class: 'count-pill' });
  button.append(pill);
  const setCount = (n) => {
    pill.textContent = String(n);
    pill.hidden = n === 0;
  };
  setCount(count);
  return { button, setCount };
}
