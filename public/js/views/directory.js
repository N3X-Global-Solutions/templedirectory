import { api } from '../api.js';
import { confirmDialog, debounce, emptyState, h, icon, toast } from '../dom.js';
import { formatNumber, formatPhone, formatRupees, formatRupeesCompact, relationPrefix, tamilName } from '../format.js';
import { createFilterPanel, filterChips, filterToggleButton, readFilters } from './filters.js';

const SEARCH_DELAY_MS = 250;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'city', label: 'City' },
  { value: 'raasi', label: 'Raasi' },
  { value: 'natchathram', label: 'Natchathram' },
  { value: 'gothram', label: 'Gothram' },
  { value: 'pincode', label: 'Pincode' },
  { value: 'donation', label: 'Donation total' },
  { value: 'created', label: 'Recently added' },
  { value: 'updated', label: 'Recently updated' },
];

function statTile(label, value, detail, accent = '') {
  return h('div', { class: `stat ${accent}` },
    h('span', { class: 'stat__value' }, value),
    h('span', { class: 'stat__label' }, label),
    detail ? h('span', { class: 'stat__detail' }, detail) : null);
}

function statsStrip(stats) {
  return h('div', { class: 'stats' },
    statTile('Registered devotees', formatNumber(stats.devotees), 'Heads of family', 'stat--primary'),
    statTile('Family members', formatNumber(stats.family_members), 'Across all households'),
    statTile('Donors', formatNumber(stats.donors), 'With recorded donations'),
    statTile('Donations this year', formatRupeesCompact(stats.year_donation_paise), `All time ${formatRupees(stats.total_donation_paise)}`, 'stat--gold'));
}

export async function renderDirectory(ctx) {
  const { session, query } = ctx;
  const { reference, permissions } = session;
  ctx.setTitle('Directory');

  let state = {
    q: query.get('q') ?? '',
    filters: readFilters(query),
    sort: query.get('sort') ?? 'name',
    dir: query.get('dir') === 'desc' ? 'desc' : 'asc',
    page: Math.max(1, Number(query.get('page')) || 1),
    pageSize: PAGE_SIZE_OPTIONS.includes(Number(query.get('pageSize'))) ? Number(query.get('pageSize')) : 25,
  };

  const [{ data: stats }, { data: facets }] = await Promise.all([api.get('/stats'), api.get('/facets')]);
  if (!ctx.isCurrent()) return null;

  const statsHost = h('div', {}, statsStrip(stats));
  const results = h('div', { class: 'results', 'aria-live': 'polite' });
  const pagination = h('div', { class: 'pagination' });
  const chipsHost = h('div', {});
  const summary = h('p', { class: 'page-sub' });
  let requestSeq = 0;

  const panel = createFilterPanel({
    reference, facets, values: state.filters,
    onChange: (filters) => apply({ filters, page: 1 }),
  });
  const toggle = filterToggleButton(panel, Object.keys(state.filters).length);

  const searchInput = h('input', {
    class: 'input', type: 'search', value: state.q, 'aria-label': 'Search devotees',
    placeholder: 'Search by name, phone, city, pincode, gothram or family member…',
  });
  const runSearch = debounce(() => apply({ q: searchInput.value.trim(), page: 1 }), SEARCH_DELAY_MS);
  searchInput.addEventListener('input', runSearch);

  const sortSelect = h('select', { class: 'select', 'aria-label': 'Sort by', onchange: () => apply({ sort: sortSelect.value, page: 1 }) },
    SORT_OPTIONS.map((o) => h('option', { value: o.value }, o.label)));
  sortSelect.value = state.sort;
  const dirButton = h('button', { type: 'button', class: 'btn btn--icon', onclick: () => apply({ dir: state.dir === 'asc' ? 'desc' : 'asc' }) });

  function apply(patch) {
    state = { ...state, ...patch };
    load();
  }

  function syncControls() {
    sortSelect.value = state.sort;
    dirButton.replaceChildren(h('span', { 'aria-hidden': 'true' }, state.dir === 'asc' ? '↑' : '↓'));
    dirButton.setAttribute('aria-label', state.dir === 'asc' ? 'Ascending — switch to descending' : 'Descending — switch to ascending');
    toggle.setCount(Object.keys(state.filters).length);
    panel.setValues(state.filters);
    chipsHost.replaceChildren(filterChips(state.filters, (key) => {
      const { [key]: _removed, ...rest } = state.filters;
      apply({ filters: rest, page: 1 });
    }) ?? '');
    ctx.setQuery({ q: state.q, ...state.filters, sort: state.sort === 'name' ? '' : state.sort, dir: state.dir === 'asc' ? '' : 'desc', page: state.page > 1 ? state.page : '', pageSize: state.pageSize === 25 ? '' : state.pageSize });
  }

  async function removeDevotee(person) {
    const confirmed = await confirmDialog({
      title: `Delete ${person.name}?`,
      message: 'This permanently removes the devotee along with their family members and donation history. This cannot be undone.',
      confirmText: 'Delete permanently',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.delete(`/devotees/${person.id}`);
      toast(`${person.name} was removed from the directory.`, 'success');
      const { data } = await api.get('/stats');
      statsHost.replaceChildren(statsStrip(data));
      load();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function sortHeader(label, key) {
    const active = state.sort === key;
    return h('th', { scope: 'col', 'aria-sort': active ? (state.dir === 'asc' ? 'ascending' : 'descending') : null },
      h('button', {
        type: 'button', class: `sort-btn${active ? ' is-sorted' : ''}`,
        onclick: () => apply(active ? { dir: state.dir === 'asc' ? 'desc' : 'asc' } : { sort: key, dir: 'asc', page: 1 }),
      }, label, h('span', { class: 'sort-btn__arrow', 'aria-hidden': 'true' }, active && state.dir === 'desc' ? '▼' : '▲')));
  }

  function row(person) {
    const stars = [person.raasi, person.natchathram].filter(Boolean);
    return h('tr', {},
      h('td', { dataset: { label: 'Name' } },
        h('a', { class: 'person-link', href: `#/devotees/${person.id}` }, person.name),
        h('div', { class: 'person-sub' },
          person.father_name ? h('span', {}, `${relationPrefix(person.gender)} ${person.father_name}`) : null,
          h('span', { class: `badge badge--${person.member_type}` }, person.member_type),
          person.hundiyal_wanted ? h('span', { class: 'badge badge--hundiyal', title: 'Wants a hundiyal' }, 'Hundiyal') : null)),
      h('td', { dataset: { label: 'Phone' }, class: 'nowrap' }, h('a', { href: `tel:${person.phone}`, class: 'phone-link' }, formatPhone(person.phone))),
      h('td', { dataset: { label: 'Place' } },
        person.city || h('span', { class: 'muted' }, '—'),
        h('div', { class: 'muted small' }, [person.state, person.pincode].filter(Boolean).join(' · '))),
      h('td', { dataset: { label: 'Raasi · Star' } },
        stars.length ? h('span', { class: 'stars-cell' },
          h('span', {}, stars.join(' · ')),
          h('span', { class: 'ta small' }, [tamilName(reference.raasis, person.raasi), tamilName(reference.nakshatras, person.natchathram)].filter(Boolean).join(' · ')))
          : h('span', { class: 'muted' }, '—')),
      h('td', { dataset: { label: 'Gothram' } }, person.gothram || h('span', { class: 'muted' }, '—')),
      h('td', { dataset: { label: 'Family' }, class: 'num' }, String(person.family_count)),
      h('td', { dataset: { label: 'Donations' }, class: 'num nowrap' }, person.total_donation_paise ? formatRupees(person.total_donation_paise) : h('span', { class: 'muted' }, '—')),
      h('td', { class: 'row-actions-cell' }, h('div', { class: 'row-actions' },
        h('a',{ class: 'btn btn--sm btn--ghost', href: `#/devotees/${person.id}`, 'aria-label': `View ${person.name}` }, icon('eye'), 'View'),
        permissions.canEdit ? h('a', { class: 'btn btn--sm btn--ghost', href: `#/devotees/${person.id}/edit`, 'aria-label': `Edit ${person.name}` }, icon('edit'), 'Edit') : null,
        permissions.canEdit ? h('button', { type: 'button', class: 'btn btn--sm btn--icon btn--danger', 'aria-label': `Delete ${person.name}`, title: 'Delete', onclick: () => removeDevotee(person) }, icon('trash')) : null)));
  }

  function renderResults(items, meta) {
    summary.textContent = meta.total === stats.devotees || !stats.devotees
      ? `${formatNumber(meta.total)} ${meta.total === 1 ? 'household' : 'households'} in the directory`
      : `Showing ${formatNumber(meta.total)} of ${formatNumber(stats.devotees)} households`;

    if (items.length === 0) {
      const filtered = state.q || Object.keys(state.filters).length > 0;
      results.replaceChildren(emptyState({
        title: filtered ? 'No matching devotees' : 'The directory is waiting for its first devotee',
        message: filtered ? 'Try a different spelling, a shorter phone number, or clear some filters.' : 'Add devotees and their families to begin.',
        action: !filtered && permissions.canEdit ? h('a', { class: 'btn btn--primary', href: '#/devotees/new' }, icon('plus'), 'Add the first devotee') : null,
      }));
      pagination.replaceChildren();
      return;
    }

    results.replaceChildren(h('div', { class: 'table-wrap' },
      h('table', { class: 'data-table directory-table' },
        h('thead', {}, h('tr', {},
          sortHeader('Name', 'name'),
          h('th', { scope: 'col' }, 'Phone'),
          sortHeader('Place', 'city'),
          sortHeader('Raasi · Natchathram', 'raasi'),
          sortHeader('Gothram', 'gothram'),
          h('th', { scope: 'col', class: 'num' }, 'Family'),
          sortHeader('Donations', 'donation'),
          h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Actions')))),
        h('tbody', {}, items.map(row)))));

    renderPagination(meta);
  }

  function renderPagination(meta) {
    const { page, pageCount, total, pageSize } = meta;
    const first = (page - 1) * pageSize + 1;
    const last = Math.min(page * pageSize, total);
    const windowPages = [...new Set([1, page - 1, page, page + 1, pageCount])].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
    const sizeSelect = h('select', { class: 'select select--compact', 'aria-label': 'Rows per page', onchange: () => apply({ pageSize: Number(sizeSelect.value), page: 1 }) },
      PAGE_SIZE_OPTIONS.map((size) => h('option', { value: String(size) }, `${size} per page`)));
    sizeSelect.value = String(pageSize);

    pagination.replaceChildren(
      h('div', { class: 'pagination__info muted small' }, `${formatNumber(first)}–${formatNumber(last)} of ${formatNumber(total)}`, sizeSelect),
      h('div', { class: 'pagination__pages' },
        h('button', { type: 'button', class: 'btn btn--sm', disabled: page <= 1, onclick: () => apply({ page: page - 1 }) }, '‹ Prev'),
        windowPages.flatMap((p, index) => [
          index > 0 && p - windowPages[index - 1] > 1 ? h('span', { class: 'muted' }, '…') : null,
          h('button', { type: 'button', class: `btn btn--sm pagination__page${p === page ? ' is-current' : ''}`, 'aria-current': p === page ? 'page' : null, onclick: () => apply({ page: p }) }, String(p)),
        ]),
        h('button', { type: 'button', class: 'btn btn--sm', disabled: page >= pageCount, onclick: () => apply({ page: page + 1 }) }, 'Next ›')));
  }

  async function load() {
    const seq = ++requestSeq;
    syncControls();
    results.setAttribute('aria-busy', 'true');
    try {
      const params = new URLSearchParams({ ...state.filters, sort: state.sort, dir: state.dir, page: String(state.page), pageSize: String(state.pageSize) });
      if (state.q) params.set('q', state.q);
      const { data, meta } = await api.get(`/devotees?${params}`);
      if (seq !== requestSeq || !ctx.isCurrent()) return;
      if (data.length === 0 && meta.total > 0 && state.page > 1) {
        apply({ page: meta.pageCount });
        return;
      }
      renderResults(data, meta);
    } catch (error) {
      if (seq !== requestSeq) return;
      results.replaceChildren(emptyState({ mark: '!', title: 'Could not load the directory', message: error.message }));
    } finally {
      if (seq === requestSeq) results.removeAttribute('aria-busy');
    }
  }

  ctx.root.replaceChildren(
    h('section', { class: 'page-head' },
      h('div', { class: 'page-head__text' },
        h('p', { class: 'eyebrow' }, 'Devotee register'),
        h('h1', { class: 'page-title' }, 'Directory'),
        summary),
      h('div', { class: 'page-head__actions' },
        h('a', { class: 'btn', href: '#/pooja' }, icon('star'), 'Pooja lookup'),
        permissions.canEdit ? h('a', { class: 'btn btn--primary', href: '#/devotees/new' }, icon('plus'), 'Add devotee') : null)),
    statsHost,
    h('section', { class: 'panel directory' },
      h('div', { class: 'toolbar' },
        h('label', { class: 'search' }, icon('search'), searchInput),
        h('div', { class: 'toolbar__controls' },
          toggle.button,
          h('div', { class: 'sort-control' }, h('span', { class: 'muted small' }, 'Sort'), sortSelect, dirButton))),
      panel.element,
      chipsHost,
      results,
      pagination));

  if (Object.keys(state.filters).length > 0) {
    panel.element.hidden = false;
    toggle.button.setAttribute('aria-expanded', 'true');
  }

  await load();
  return () => runSearch.cancel();
}
