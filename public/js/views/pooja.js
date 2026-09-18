import { api } from '../api.js';
import { debounce, emptyState, h, icon, printElement } from '../dom.js';
import { formatPhone, tamilName } from '../format.js';

const SEARCH_DELAY_MS = 300;
const MIN_QUERY = 2;

function starTile(label, value, ta) {
  return h('div', { class: `star-tile${value ? '' : ' is-empty'}` },
    h('span', { class: 'star-tile__label' }, label),
    h('span', { class: 'star-tile__value' }, value || 'Not recorded'),
    ta ? h('span', { class: 'star-tile__ta' }, ta) : null);
}

function matches(name, term) {
  return term.length >= MIN_QUERY && name.toLowerCase().includes(term.toLowerCase());
}

function sankalpamCard(person, reference, term) {
  const card = h('article', { class: 'sankalpam' });
  const rows = [
    { name: person.name, relation: 'Head of family', raasi: person.raasi, natchathram: person.natchathram, head: true },
    ...person.family_members,
  ];

  card.append(
    h('header', { class: 'sankalpam__head' },
      h('div', {},
        h('h2', { class: 'sankalpam__name' }, person.name),
        h('p', { class: 'sankalpam__meta muted small' },
          [person.father_name && `Father: ${person.father_name}`, formatPhone(person.phone), person.city].filter(Boolean).join(' · '))),
      h('div', { class: 'sankalpam__tools no-print' },
        h('a', { class: 'btn btn--sm btn--ghost', href: `#/devotees/${person.id}` }, icon('eye'), 'Record'),
        h('button', { type: 'button', class: 'btn btn--sm', onclick: () => printElement(card) }, icon('print'), 'Print'))),
    h('div', { class: 'sankalpam__lineage' },
      h('div', { class: 'sankalpam__gothram' },
        h('span', { class: 'star-tile__label' }, 'Gothram'),
        h('strong', {}, person.gothram || 'Not recorded')),
      person.tamil_birth_month ? h('div', { class: 'sankalpam__gothram' },
        h('span', { class: 'star-tile__label' }, 'Born in'),
        h('strong', {}, `${person.tamil_birth_month.en} month`),
        h('span', { class: 'ta' }, `${person.tamil_birth_month.ta} மாதம்`)) : null),
    h('div', { class: 'star-pair' },
      starTile('Raasi', person.raasi, tamilName(reference.raasis, person.raasi)),
      starTile('Natchathram', person.natchathram, tamilName(reference.nakshatras, person.natchathram))),
    h('div', { class: 'table-wrap' },
      h('table', { class: 'data-table sankalpam__family' },
        h('thead', {}, h('tr', {}, ['Name', 'Relation', 'Raasi', 'Natchathram'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, rows.map((m) => h('tr', { class: [m.head ? 'is-head' : '', matches(m.name, term) ? 'is-match' : ''].join(' ').trim() },
          h('td', { dataset: { label: 'Name' } }, h('strong', {}, m.name)),
          h('td', { dataset: { label: 'Relation' } }, m.relation || '—'),
          h('td', { dataset: { label: 'Raasi' } }, m.raasi ? [m.raasi, h('span', { class: 'ta small' }, ` ${tamilName(reference.raasis, m.raasi)}`)] : h('span', { class: 'muted' }, '—')),
          h('td', { dataset: { label: 'Natchathram' } }, m.natchathram ? [m.natchathram, h('span', { class: 'ta small' }, ` ${tamilName(reference.nakshatras, m.natchathram)}`)] : h('span', { class: 'muted' }, '—')))))))
  );
  return card;
}

export async function renderPooja(ctx) {
  const { session, query } = ctx;
  const { reference } = session;
  ctx.setTitle('Pooja lookup');

  const results = h('div', { class: 'pooja__results', 'aria-live': 'polite' });
  const searchInput = h('input', {
    class: 'input', type: 'search', id: 'pooja-search', value: query.get('q') ?? '', autocomplete: 'off',
    placeholder: 'Type a name or phone number…',
  });
  let requestSeq = 0;

  const hint = () => emptyState({
    mark: '✦',
    title: 'Find raasi & natchathram in seconds',
    message: 'Enter the devotee’s name, any family member’s name, or their phone number. Addresses and other details stay hidden here.',
  });

  async function search() {
    const term = searchInput.value.trim();
    ctx.setQuery({ q: term });
    const seq = ++requestSeq;
    if (term.length < MIN_QUERY) {
      results.replaceChildren(hint());
      return;
    }
    results.setAttribute('aria-busy', 'true');
    try {
      const { data } = await api.get(`/pooja?q=${encodeURIComponent(term)}`);
      if (seq !== requestSeq || !ctx.isCurrent()) return;
      results.replaceChildren(data.length
        ? h('div', { class: 'pooja__list' },
          h('p', { class: 'muted small' }, `${data.length} ${data.length === 1 ? 'family' : 'families'} found${data.length >= 25 ? ' — refine the search to narrow down' : ''}`),
          data.map((person) => sankalpamCard(person, reference, term)))
        : emptyState({ mark: '?', title: 'No one found', message: `Nothing matches “${term}”. Check the spelling or try the phone number.` }));
    } catch (error) {
      if (seq === requestSeq) results.replaceChildren(emptyState({ mark: '!', title: 'Search failed', message: error.message }));
    } finally {
      if (seq === requestSeq) results.removeAttribute('aria-busy');
    }
  }

  const runSearch = debounce(search, SEARCH_DELAY_MS);
  searchInput.addEventListener('input', runSearch);

  ctx.root.replaceChildren(
    h('section', { class: 'pooja' },
      h('header', { class: 'pooja__hero' },
        h('p', { class: 'eyebrow' }, 'For archanai & sankalpam'),
        h('h1', { class: 'page-title' }, 'Pooja lookup'),
        h('p', { class: 'page-sub' }, 'Raasi, natchathram and gothram for the whole family — nothing else.'),
        h('label', { class: 'search search--hero', for: 'pooja-search' },
          h('span', { class: 'visually-hidden' }, 'Name or phone number'),
          icon('lamp'),
          searchInput)),
      results));

  searchInput.focus();
  await search();
  return () => runSearch.cancel();
}
