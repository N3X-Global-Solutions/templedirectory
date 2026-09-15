import { api, downloadFile } from '../api.js';
import { debounce, emptyState, h, icon, toast } from '../dom.js';
import { addressLines, formatNumber, formatPhone, hasMailingAddress, relationPrefix } from '../format.js';
import { createFilterPanel, filterChips, filterToggleButton, readFilters } from './filters.js';

const SEARCH_DELAY_MS = 300;

function label(person) {
  return h('div', { class: 'mail-label' },
    h('span', { class: 'mail-label__to' }, 'To,'),
    h('strong', { class: 'mail-label__name' }, person.name),
    person.father_name ? h('span', {}, `${relationPrefix(person.gender)} ${person.father_name}`) : null,
    addressLines(person).map((line) => h('span', {}, line)),
    person.phone ? h('span', { class: 'mail-label__phone' }, `Ph: ${formatPhone(person.phone)}`) : null);
}

export async function renderMailing(ctx) {
  const { session, query } = ctx;
  const { reference, permissions } = session;
  ctx.setTitle('Mailing addresses');

  let state = { q: query.get('q') ?? '', filters: readFilters(query), view: 'list', completeOnly: true };
  let entries = [];
  let meta = { total: 0, limited: false };
  let selected = new Set();
  let requestSeq = 0;

  const { data: facets } = await api.get('/facets');
  if (!ctx.isCurrent()) return null;

  const content = h('div', { class: 'mailing__content' });
  const selectionBar = h('div', { class: 'selection-bar' });
  const chipsHost = h('div', {});

  const panel = createFilterPanel({ reference, facets, values: state.filters, onChange: (filters) => { state = { ...state, filters }; load(); } });
  const toggle = filterToggleButton(panel, Object.keys(state.filters).length);
  const searchInput = h('input', { class: 'input', type: 'search', value: state.q, 'aria-label': 'Search addresses', placeholder: 'Search a name, phone number, city or pincode…' });
  const runSearch = debounce(() => { state = { ...state, q: searchInput.value.trim() }; load(); }, SEARCH_DELAY_MS);
  searchInput.addEventListener('input', runSearch);

  const visibleEntries = () => (state.completeOnly ? entries.filter(hasMailingAddress) : entries);
  const chosenEntries = () => (selected.size > 0 ? entries.filter((e) => selected.has(e.id)) : visibleEntries());

  function setSelected(next) {
    selected = next;
    render();
  }

  function toggleOne(id, checked) {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    setSelected(next);
  }

  async function download() {
    try {
      const ids = selected.size > 0 ? [...selected] : visibleEntries().map((e) => e.id);
      await downloadFile('/mailing/export', { method: 'POST', body: { ids }, fallbackName: 'mailing-addresses.csv' });
      toast(`Downloaded ${formatNumber(ids.length)} ${ids.length === 1 ? 'address' : 'addresses'}.`, 'success');
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function printLabels() {
    state = { ...state, view: 'labels' };
    render();
    requestAnimationFrame(() => window.print());
  }

  function renderSelectionBar() {
    const visible = visibleEntries();
    const count = selected.size;
    const scopeText = count > 0 ? `${formatNumber(count)} selected` : `All ${formatNumber(visible.length)} shown`;
    const allChecked = visible.length > 0 && visible.every((e) => selected.has(e.id));

    selectionBar.replaceChildren(
      h('div', { class: 'selection-bar__info' },
        h('label', { class: 'checkbox' },
          h('input', { type: 'checkbox', checked: allChecked, 'aria-label': 'Select all shown', onchange: (e) => setSelected(e.target.checked ? new Set(visible.map((v) => v.id)) : new Set()) }),
          h('strong', {}, scopeText)),
        count > 0 ? h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => setSelected(new Set()) }, 'Clear selection') : null,
        h('label', { class: 'checkbox small' },
          h('input', { type: 'checkbox', checked: state.completeOnly, onchange: (e) => { state = { ...state, completeOnly: e.target.checked }; render(); } }),
          'Only complete addresses')),
      h('div', { class: 'selection-bar__actions' },
        h('div', { class: 'segmented', role: 'group', 'aria-label': 'View' },
          ['list', 'labels'].map((mode) => h('button', {
            type: 'button', class: `segmented__btn${state.view === mode ? ' is-active' : ''}`, 'aria-pressed': String(state.view === mode),
            onclick: () => { state = { ...state, view: mode }; render(); },
          }, mode === 'list' ? 'List' : 'Labels'))),
        permissions.canExport ? h('button', { type: 'button', class: 'btn btn--sm', onclick: printLabels, disabled: chosenEntries().length === 0 }, icon('print'), 'Print labels') : null,
        permissions.canExport ? h('button', { type: 'button', class: 'btn btn--sm btn--primary', onclick: download, disabled: chosenEntries().length === 0 }, icon('download'), count > 0 ? 'Download selected' : 'Download all') : null));
  }

  function renderList(visible) {
    return h('div', { class: 'table-wrap' },
      h('table', { class: 'data-table mailing-table' },
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Select')),
          h('th', { scope: 'col' }, 'Name'),
          h('th', { scope: 'col' }, 'Postal address'),
          h('th', { scope: 'col' }, 'Phone'))),
        h('tbody', {}, visible.map((person) => h('tr', { class: selected.has(person.id) ? 'is-selected' : '' },
          h('td', { class: 'check-cell' }, h('input', { type: 'checkbox', checked: selected.has(person.id), 'aria-label': `Select ${person.name}`, onchange: (e) => toggleOne(person.id, e.target.checked) })),
          h('td', { dataset: { label: 'Name' } },
            h('a', { class: 'person-link', href: `#/devotees/${person.id}` }, person.name),
            person.father_name ? h('div', { class: 'person-sub' }, `${relationPrefix(person.gender)} ${person.father_name}`) : null),
          h('td', { dataset: { label: 'Address' } },
            hasMailingAddress(person) ? null : h('span', { class: 'badge badge--warn' }, 'Incomplete address'),
            h('address', { class: 'postal postal--compact' }, addressLines(person).map((line) => h('span', {}, line)))),
          h('td', { class: 'nowrap', dataset: { label: 'Phone' } }, formatPhone(person.phone)))))));
  }

  function render() {
    renderSelectionBar();
    const visible = visibleEntries();
    if (visible.length === 0) {
      content.replaceChildren(emptyState({
        mark: '✉',
        title: entries.length ? 'No complete addresses here' : 'No addresses match',
        message: entries.length ? 'Untick "Only complete addresses" to see records missing an address or pincode.' : 'Change the search or filters to find devotees.',
      }));
      return;
    }
    const notice = meta.limited ? h('p', { class: 'notice' }, `Showing the first ${formatNumber(entries.length)} of ${formatNumber(meta.total)}. Narrow the filters to see the rest.`) : null;
    content.replaceChildren(
      notice ?? '',
      state.view === 'labels'
        ? h('div', { class: 'labels' }, chosenEntries().map(label))
        : renderList(visible));
  }

  async function load() {
    const seq = ++requestSeq;
    toggle.setCount(Object.keys(state.filters).length);
    panel.setValues(state.filters);
    chipsHost.replaceChildren(filterChips(state.filters, (key) => {
      const { [key]: _removed, ...rest } = state.filters;
      state = { ...state, filters: rest };
      load();
    }) ?? '');
    ctx.setQuery({ q: state.q, ...state.filters });
    try {
      const params = new URLSearchParams({ ...state.filters, ...(state.q ? { q: state.q } : {}) });
      const result = await api.get(`/mailing?${params}`);
      if (seq !== requestSeq || !ctx.isCurrent()) return;
      entries = result.data;
      meta = result.meta;
      const ids = new Set(entries.map((e) => e.id));
      selected = new Set([...selected].filter((id) => ids.has(id)));
      render();
    } catch (error) {
      if (seq === requestSeq) content.replaceChildren(emptyState({ mark: '!', title: 'Could not load addresses', message: error.message }));
    }
  }

  ctx.root.replaceChildren(
    h('section', { class: 'page-head' },
      h('div', { class: 'page-head__text' },
        h('p', { class: 'eyebrow' }, 'Invitations & prasadam'),
        h('h1', { class: 'page-title' }, 'Mailing addresses'),
        h('p', { class: 'page-sub' }, permissions.canExport
          ? 'Pick particular devotees or use everyone shown, then print address labels or download them as a spreadsheet.'
          : 'View postal addresses. Printing and downloading are available to the administrator.'))),
    h('section', { class: 'panel mailing' },
      h('div', { class: 'toolbar' },
        h('label', { class: 'search' }, icon('search'), searchInput),
        h('div', { class: 'toolbar__controls' }, toggle.button)),
      panel.element,
      chipsHost,
      selectionBar,
      content));

  await load();
  return () => runSearch.cancel();
}
