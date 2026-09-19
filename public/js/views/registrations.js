import { api } from '../api.js';
import { confirmDialog, emptyState, h, icon, toast } from '../dom.js';
import { addressLines, formatDate, formatPhone, formatTimestamp, relationPrefix, tamilName } from '../format.js';
import { tamilDate } from '../tamilCalendar.js';

const TABS = [
  { status: 'pending', label: 'Waiting for review' },
  { status: 'approved', label: 'Added' },
  { status: 'rejected', label: 'Not added' },
];

const dash = () => h('span', { class: 'muted' }, '—');

function fact(label, value) {
  return value ? [h('dt', {}, label), h('dd', {}, value)] : [];
}

/** Same phone number as an existing devotee, or as another form still waiting. */
function duplicateWarning(registration) {
  if (registration.already_registered) {
    return h('p', { class: 'registration__warning' },
      icon('shield'),
      h('span', {},
        'This phone number already belongs to ',
        h('a', { href: `#/devotees/${registration.already_registered.id}` }, registration.already_registered.name),
        '. Adding this form will be refused — open that record and update it by hand instead.'));
  }
  if (registration.duplicate_pending) {
    return h('p', { class: 'registration__warning' },
      icon('shield'),
      h('span', {}, 'Another form waiting for review has this same phone number. Add only one of them.'));
  }
  return null;
}

function familyList(members, reference) {
  if (!members?.length) return h('p', { class: 'muted small' }, 'No family members listed.');
  return h('ul', { class: 'registration__family' }, members.map((member) => h('li', {},
    h('strong', {}, member.name),
    member.relation ? h('span', { class: 'muted' }, ` (${member.relation})`) : null,
    member.phone ? h('span', { class: 'muted small' }, ` · ${formatPhone(member.phone)}`) : null,
    member.raasi || member.natchathram
      ? h('span', { class: 'muted small' }, ` · ${[member.raasi, member.natchathram].filter(Boolean).join(' / ')}`)
      : null)));
}

export async function renderRegistrations(ctx) {
  const { reference } = ctx.session;
  ctx.setTitle('Registrations');

  let status = TABS.some((tab) => tab.status === ctx.query.get('status')) ? ctx.query.get('status') : 'pending';
  let counts = { pending: 0, approved: 0, rejected: 0 };
  let waiting = [];
  let selected = new Set();
  const listHost = h('div', { class: 'registrations__list', 'aria-live': 'polite' });
  const selectionBar = h('div', { class: 'registrations__bar' });
  const tabsHost = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Registration status' });
  const summary = h('p', { class: 'page-sub' });

  function renderTabs() {
    tabsHost.replaceChildren(...TABS.map((tab) => {
      const isActive = tab.status === status;
      return h('button', {
        type: 'button',
        class: `segmented__btn${isActive ? ' is-active' : ''}`,
        'aria-pressed': String(isActive),
        onclick: () => {
          status = tab.status;
          load();
        },
      }, tab.label, counts[tab.status] ? h('span', { class: 'count-pill' }, String(counts[tab.status])) : null);
    }));
  }

  const announceChange = () => window.dispatchEvent(new CustomEvent('registrations:changed'));

  /** Keeps the tick boxes, the highlighted cards and the bar in step. */
  function paintSelection() {
    renderSelectionBar();
    listHost.querySelectorAll('.registration').forEach((element) => {
      const picked = selected.has(Number(element.dataset.id));
      element.classList.toggle('is-picked', picked);
      const box = element.querySelector('.registration__pick input');
      if (box) box.checked = picked;
    });
  }

  function setSelection(ids) {
    selected = new Set(ids);
    paintSelection();
  }

  function toggle(id, picked) {
    const next = new Set(selected);
    if (picked) next.add(id);
    else next.delete(id);
    setSelection(next);
  }

  /** Adds or turns down everything ticked, in one request. */
  async function bulkAct(action) {
    const ids = [...selected];
    if (ids.length === 0) return;
    const confirmed = await confirmDialog({
      title: action === 'approve' ? `Add ${ids.length} to the directory?` : `Do not add ${ids.length} forms?`,
      message: action === 'approve'
        ? 'Each one becomes a devotee record. Any form whose phone number is already registered is left behind for you to sort out.'
        : 'They stay in the "Not added" list for your records, and no devotee records are created.',
      confirmText: action === 'approve' ? `Add ${ids.length}` : 'Do not add',
      danger: action === 'reject',
    });
    if (!confirmed) return;

    try {
      const { data } = await api.post('/registrations/bulk', { action, ids });
      if (data.done.length > 0) {
        toast(action === 'approve'
          ? `${data.done.length} added to the directory.`
          : `${data.done.length} marked as not added.`, 'success');
      }
      if (data.skipped.length > 0) {
        const first = data.skipped.slice(0, 2).map((item) => `${item.name} — ${item.reason}`).join('; ');
        const more = data.skipped.length > 2 ? ` and ${data.skipped.length - 2} more` : '';
        toast(`${data.skipped.length} could not be added: ${first}${more}`, 'error');
      }
      selected = new Set();
      announceChange();
      load();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function renderSelectionBar() {
    if (status !== 'pending' || waiting.length === 0) {
      selectionBar.replaceChildren();
      return;
    }
    const count = selected.size;
    const allPicked = count > 0 && waiting.every((registration) => selected.has(registration.id));
    selectionBar.replaceChildren(h('div', { class: 'selection-bar' },
      h('div', { class: 'selection-bar__info' },
        h('label', { class: 'checkbox' },
          h('input', {
            type: 'checkbox',
            checked: allPicked,
            'aria-label': 'Select every form waiting for review',
            onchange: (event) => setSelection(event.target.checked ? waiting.map((r) => r.id) : []),
          }),
          h('strong', {}, count > 0 ? `${count} selected` : `Select all ${waiting.length}`)),
        count > 0 ? h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => setSelection([]) }, 'Clear') : null),
      h('div', { class: 'selection-bar__actions' },
        h('button', { type: 'button', class: 'btn btn--danger btn--sm', disabled: count === 0, onclick: () => bulkAct('reject') },
          icon('close'), count > 0 ? `Do not add (${count})` : 'Do not add'),
        h('button', { type: 'button', class: 'btn btn--primary btn--sm', disabled: count === 0, onclick: () => bulkAct('approve') },
          icon('check'), count > 0 ? `Add ${count} to directory` : 'Add to directory'))));
  }

  async function act(registration, action) {
    if (action === 'reject') {
      const confirmed = await confirmDialog({
        title: `Don't add ${registration.name}?`,
        message: 'The form stays in the "Not added" list for your records, but the devotee will not be added to the directory.',
        confirmText: 'Do not add',
        danger: true,
      });
      if (!confirmed) return;
    }
    try {
      const { data } = await api.post(`/registrations/${registration.id}/${action}`, {});
      if (action === 'approve') {
        toast(`${registration.name} has been added to the directory.`, 'success');
        announceChange();
        ctx.navigate(`#/devotees/${data.id}`);
        return;
      }
      toast(`${registration.name} was not added.`);
      announceChange();
      load();
    } catch (error) {
      toast(error.message, 'error');
      load();
    }
  }

  function card(registration) {
    const person = registration.details;
    const birthday = tamilDate(person.dob);
    const address = addressLines(person);
    return h('article', {
      class: `panel registration${selected.has(registration.id) ? ' is-picked' : ''}`,
      dataset: { id: String(registration.id) },
    },
      h('header', { class: 'registration__head' },
        h('div', { class: 'registration__heading' },
          registration.status === 'pending'
            ? h('label', { class: 'registration__pick' },
              h('input', {
                type: 'checkbox',
                checked: selected.has(registration.id),
                'aria-label': `Select ${person.name}`,
                onchange: (event) => toggle(registration.id, event.target.checked),
              }))
            : null,
          h('div', {},
            h('h2', { class: 'registration__name' }, person.name),
            h('p', { class: 'registration__meta muted small' },
              [person.father_name && `${relationPrefix(person.gender)} ${person.father_name}`,
                person.gender, person.occupation].filter(Boolean).join(' · ')))),
        h('div', { class: 'registration__when muted small' },
          h('span', {}, `Filled in ${formatTimestamp(registration.submitted_at)}`),
          registration.status !== 'pending'
            ? h('span', {}, `${registration.status === 'approved' ? 'Added' : 'Not added'} by ${registration.reviewed_by} · ${formatTimestamp(registration.reviewed_at)}`)
            : null)),

      h('div', { class: 'registration__body' },
        h('dl', { class: 'facts' },
          fact('Phone', h('a', { href: `tel:${person.phone}` }, formatPhone(person.phone))),
          fact('Alternate', person.alt_phone ? formatPhone(person.alt_phone) : ''),
          fact('Email', person.email),
          fact('Date of birth', person.dob ? formatDate(person.dob) : ''),
          fact('Tamil birthday', birthday ? `${birthday.month.en} ${birthday.day} (${birthday.month.ta})` : ''),
          fact('Hundiyal wanted', person.hundiyal_wanted ? 'Yes' : 'No'),
          fact('Japa Homa (yearly)', person.japa_homa_yearly ? 'Yes' : 'No'),
          fact('Annadhanam on Amavasai', person.annadhanam_offer ? 'Yes' : 'No')),
        h('dl', { class: 'facts' },
          fact('Address', address.length ? h('span', { class: 'registration__address' }, address.join(', ')) : ''),
          fact('Native place', person.native_place),
          fact('Raasi', person.raasi ? `${person.raasi} · ${tamilName(reference.raasis, person.raasi)}` : ''),
          fact('Natchathram', person.natchathram ? `${person.natchathram} · ${tamilName(reference.nakshatras, person.natchathram)}` : ''),
          fact('Gothram', person.gothram),
          fact('Caste', person.caste))),

      duplicateWarning(registration),

      h('div', { class: 'registration__family-block' },
        h('h3', { class: 'registration__subtitle' }, `Family members (${person.family_members?.length ?? 0})`),
        familyList(person.family_members, reference)),

      registration.status === 'pending'
        ? h('footer', { class: 'registration__actions' },
          h('button', { type: 'button', class: 'btn btn--danger', onclick: () => act(registration, 'reject') }, icon('close'), 'Do not add'),
          h('button', { type: 'button', class: 'btn btn--primary', onclick: () => act(registration, 'approve') }, icon('check'), 'Add to directory'))
        : h('footer', { class: 'registration__actions' },
          registration.devotee_id
            ? h('a', { class: 'btn btn--sm', href: `#/devotees/${registration.devotee_id}` }, icon('eye'), 'Open record')
            : h('span', { class: 'badge badge--muted' }, 'Not added')));
  }

  async function load() {
    listHost.setAttribute('aria-busy', 'true');
    try {
      const { data, meta } = await api.get(`/registrations?status=${status}`);
      if (!ctx.isCurrent()) return;
      counts = meta.counts;
      waiting = status === 'pending' ? data : [];
      const visible = new Set(data.map((registration) => registration.id));
      selected = new Set([...selected].filter((id) => visible.has(id)));
      ctx.setQuery({ status: status === 'pending' ? '' : status });
      renderTabs();
      renderSelectionBar();
      summary.textContent = counts.pending === 0
        ? 'No forms are waiting for review.'
        : `${counts.pending} ${counts.pending === 1 ? 'form is' : 'forms are'} waiting for review.`;
      listHost.replaceChildren(data.length
        ? h('div', { class: 'registrations__cards' }, data.map(card))
        : emptyState({
          mark: '✉',
          title: status === 'pending' ? 'Nothing waiting for review' : 'Nothing here yet',
          message: status === 'pending'
            ? 'When a devotee fills in the shared form, it will appear here for you to add.'
            : 'Forms you have already reviewed will be listed here.',
          action: status === 'pending' ? h('a', { class: 'btn', href: '#/settings' }, icon('settings'), 'Share the form link') : null,
        }));
    } catch (error) {
      listHost.replaceChildren(emptyState({ mark: '!', title: 'Could not load registrations', message: error.message }));
    } finally {
      listHost.removeAttribute('aria-busy');
    }
  }

  ctx.root.replaceChildren(
    h('section', { class: 'page-head' },
      h('div', { class: 'page-head__text' },
        h('p', { class: 'eyebrow' }, 'From the shared form'),
        h('h1', { class: 'page-title' }, 'Registrations'),
        summary),
      h('div', { class: 'page-head__actions' },
        h('a', { class: 'btn', href: '#/settings' }, icon('settings'), 'Share link'))),
    h('div', { class: 'registrations__tabs' }, tabsHost),
    selectionBar,
    listHost);

  renderTabs();
  await load();
  return null;
}
