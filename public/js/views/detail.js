import { api } from '../api.js';
import { confirmDialog, h, icon, printElement, toast } from '../dom.js';
import {
  addressLines, ageFrom, formatDate, formatPhone, formatRupees, formatTimestamp, initials, relationPrefix, tamilName,
} from '../format.js';

const dash = () => h('span', { class: 'muted' }, '—');

function fact(label, value) {
  return [h('dt', {}, label), h('dd', {}, value || dash())];
}

function starBlock(label, value, ta) {
  return h('div', { class: 'star-tile' },
    h('span', { class: 'star-tile__label' }, label),
    h('span', { class: 'star-tile__value' }, value || '—'),
    ta ? h('span', { class: 'star-tile__ta' }, ta) : null);
}

function familyTable(members, reference) {
  if (members.length === 0) return h('p', { class: 'muted' }, 'No family members recorded.');
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, ['Name', 'Relation', 'Raasi', 'Natchathram'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, members.map((m) => h('tr', {},
        h('td', { dataset: { label: 'Name' } }, h('strong', {}, m.name)),
        h('td', { dataset: { label: 'Relation' } }, m.relation || dash()),
        h('td', { dataset: { label: 'Raasi' } }, m.raasi ? [m.raasi, ' ', h('span', { class: 'ta small' }, tamilName(reference.raasis, m.raasi))] : dash()),
        h('td', { dataset: { label: 'Natchathram' } }, m.natchathram ? [m.natchathram, ' ', h('span', { class: 'ta small' }, tamilName(reference.nakshatras, m.natchathram))] : dash()))))));
}

function donationsTable(donations, total) {
  if (donations.length === 0) return h('p', { class: 'muted' }, 'No donations recorded.');
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, 'Date'), h('th', { scope: 'col' }, 'Purpose'), h('th', { scope: 'col' }, 'Mode'),
        h('th', { scope: 'col' }, 'Receipt'), h('th', { scope: 'col', class: 'num' }, 'Amount'))),
      h('tbody', {}, donations.map((d) => h('tr', {},
        h('td', { class: 'nowrap', dataset: { label: 'Date' } }, formatDate(d.donated_on)),
        h('td', { dataset: { label: 'Purpose' } }, d.purpose || dash()),
        h('td', { dataset: { label: 'Mode' } }, d.mode || dash()),
        h('td', { dataset: { label: 'Receipt' } }, d.receipt_no || dash()),
        h('td', { class: 'num nowrap', dataset: { label: 'Amount' } }, formatRupees(d.amount_paise))))),
      h('tfoot', {}, h('tr', {},
        h('td', { colspan: '4' }, h('strong', {}, 'Total')),
        h('td', { class: 'num nowrap' }, h('strong', {}, formatRupees(total)))))));
}

export async function renderDevoteeDetail(ctx, id) {
  const { session } = ctx;
  const { reference, permissions } = session;
  const { data: person } = await api.get(`/devotees/${id}`);
  if (!ctx.isCurrent()) return null;
  ctx.setTitle(person.name);

  const age = ageFrom(person.dob);
  const address = addressLines(person);

  async function remove() {
    const confirmed = await confirmDialog({
      title: `Delete ${person.name}?`,
      message: 'The devotee, their family members and donation history will be removed permanently.',
      confirmText: 'Delete permanently',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.delete(`/devotees/${person.id}`);
      toast(`${person.name} was removed from the directory.`, 'success');
      ctx.navigate('#/directory');
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  const record = h('article', { class: 'record panel' },
    h('header', { class: 'record__head' },
      h('div', { class: 'record__avatar', 'aria-hidden': 'true' }, initials(person.name)),
      h('div', { class: 'record__title' },
        h('p', { class: 'eyebrow' }, `Record #${person.id}`),
        h('h1', { class: 'record__name' }, person.name),
        h('p', { class: 'record__sub' },
          person.father_name ? h('span', {}, `${relationPrefix(person.gender)} ${person.father_name}`) : null,
          person.gender ? h('span', {}, person.gender) : null,
          age !== null ? h('span', {}, `${age} yrs`) : null,
          h('span', { class: `badge badge--${person.member_type}` }, person.member_type))),
      h('div', { class: 'record__actions no-print' },
        h('a', { class: 'btn btn--sm', href: `#/pooja?q=${encodeURIComponent(person.phone)}` }, icon('star'), 'Pooja card'),
        h('button', { type: 'button', class: 'btn btn--sm', onclick: () => printElement(record) }, icon('print'), 'Print'),
        permissions.canEdit ? h('a', { class: 'btn btn--sm btn--primary', href: `#/devotees/${person.id}/edit` }, icon('edit'), 'Edit') : null,
        permissions.canEdit ? h('button', { type: 'button', class: 'btn btn--sm btn--danger', onclick: remove }, icon('trash'), 'Delete') : null)),

    h('div', { class: 'record__grid' },
      h('section', { class: 'record-section' },
        h('h2', { class: 'section-title' }, 'Contact'),
        h('dl', { class: 'facts' },
          fact('Phone', h('a', { href: `tel:${person.phone}` }, formatPhone(person.phone))),
          fact('Alternate', person.alt_phone ? h('a', { href: `tel:${person.alt_phone}` }, formatPhone(person.alt_phone)) : ''),
          fact('Email', person.email ? h('a', { href: `mailto:${person.email}` }, person.email) : ''),
          fact('Date of birth', formatDate(person.dob)),
          fact('Native place', person.native_place))),

      h('section', { class: 'record-section' },
        h('h2', { class: 'section-title' }, 'Postal address'),
        address.length
          ? h('address', { class: 'postal' }, h('strong', {}, person.name), address.map((line) => h('span', {}, line)))
          : h('p', { class: 'muted' }, 'No address recorded.')),

      h('section', { class: 'record-section record-section--astro' },
        h('h2', { class: 'section-title' }, 'Raasi & lineage'),
        h('div', { class: 'star-pair' },
          starBlock('Raasi', person.raasi, tamilName(reference.raasis, person.raasi)),
          starBlock('Natchathram', person.natchathram, tamilName(reference.nakshatras, person.natchathram))),
        h('dl', { class: 'facts facts--inline' },
          fact('Gothram', person.gothram),
          fact('Caste', person.caste))),

      h('section', { class: 'record-section record-section--wide' },
        h('h2', { class: 'section-title' }, `Family members (${person.family_members.length})`),
        familyTable(person.family_members, reference)),

      h('section', { class: 'record-section record-section--wide' },
        h('h2', { class: 'section-title' }, 'Donations'),
        donationsTable(person.donations, person.total_donation_paise)),

      person.notes ? h('section', { class: 'record-section record-section--wide' },
        h('h2', { class: 'section-title' }, 'Notes'),
        h('p', { class: 'notes' }, person.notes)) : null),

    h('footer', { class: 'record__meta muted small' },
      h('span', {}, `Registered ${formatTimestamp(person.created_at)}${person.created_by ? ` by ${person.created_by}` : ''}`),
      h('span', {}, `Last updated ${formatTimestamp(person.updated_at)}${person.updated_by ? ` by ${person.updated_by}` : ''}`)));

  ctx.root.replaceChildren(
    h('nav', { class: 'crumbs no-print', 'aria-label': 'Breadcrumb' }, h('a', { href: '#/directory' }, icon('back'), 'Back to directory')),
    record);
  return null;
}
