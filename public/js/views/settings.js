import { api, downloadFile } from '../api.js';
import { confirmDialog, h, icon, toast } from '../dom.js';
import { field, input } from './formControls.js';

const MIN_PASSWORD = 8;

/** Copy that still works on a plain-HTTP office network, where the clipboard API is blocked. */
async function copyText(field_, text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Link copied. Paste it into WhatsApp or SMS.', 'success');
  } catch {
    field_.select();
    toast('Press Ctrl+C (or long-press → Copy) to copy the selected link.');
  }
}

function registrationLinkCard(templeName) {
  const linkInput = input('registrationLink', { readonly: true, class: 'input link-card__input', 'aria-label': 'Registration form link' });
  const statusBadge = h('span', { class: 'badge' });
  const toggleButton = h('button', { type: 'button', class: 'btn btn--sm' });
  const pendingLine = h('p', { class: 'muted small' });
  let link = { url: '', enabled: true };

  const shareOnWhatsApp = () => {
    const message = `${templeName} — devotee registration form. Please fill in your family details: ${link.url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  };

  function paint() {
    linkInput.value = link.url;
    statusBadge.textContent = link.enabled ? 'Link is on' : 'Link is off';
    statusBadge.className = `badge ${link.enabled ? 'badge--Volunteer' : 'badge--muted'}`;
    toggleButton.replaceChildren(icon(link.enabled ? 'close' : 'check'), link.enabled ? 'Turn the link off' : 'Turn the link on');
    linkInput.disabled = !link.enabled;
  }

  async function run(work) {
    try {
      link = await work();
      paint();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  toggleButton.addEventListener('click', () => run(async () => {
    const { data } = await api.put('/registration-link', { enabled: !link.enabled });
    toast(data.enabled ? 'The form link is on again.' : 'The form link is off. Nobody can open it now.', 'success');
    return data;
  }));

  const rotateButton = h('button', { type: 'button', class: 'btn btn--sm btn--danger' }, icon('key'), 'Create a new link');
  rotateButton.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Create a new link?',
      message: 'The link you shared earlier will stop working, so anyone who still has it cannot open the form. Use this if the old link reached the wrong people.',
      confirmText: 'Create new link',
      danger: true,
    });
    if (!confirmed) return;
    run(async () => {
      const { data } = await api.post('/registration-link/rotate', {});
      toast('New link created. Share it again with your devotees.', 'success');
      return data;
    });
  });

  const card = h('section', { class: 'panel panel--padded settings-card settings-card--wide' },
    h('div', { class: 'settings-card__icon' }, icon('users')),
    h('div', { class: 'settings-card__heading' },
      h('h2', { class: 'settings-card__title' }, 'Devotee registration form'),
      statusBadge),
    h('p', { class: 'muted small' }, 'Share this link on WhatsApp so devotees can fill in their own details. Their forms wait under Registrations until you add them to the directory.'),
    h('div', { class: 'link-card__row' },
      linkInput,
      h('button', { type: 'button', class: 'btn', onclick: () => copyText(linkInput, link.url) }, icon('tag'), 'Copy')),
    h('div', { class: 'settings-card__buttons' },
      h('button', { type: 'button', class: 'btn btn--gold', onclick: shareOnWhatsApp }, icon('phone'), 'Share on WhatsApp'),
      h('a', { class: 'btn', href: '#/registrations' }, icon('eye'), 'View registrations'),
      toggleButton,
      rotateButton),
    pendingLine);

  (async () => {
    await run(async () => (await api.get('/registration-link')).data);
    try {
      const { data } = await api.get('/registrations/summary');
      pendingLine.textContent = data.pending
        ? `${data.pending} form${data.pending === 1 ? '' : 's'} waiting for review.`
        : 'No forms are waiting for review.';
    } catch {
      // The count is a nicety; the link itself is what matters here.
    }
  })();

  return card;
}

function passwordForm({ title, description, iconName, withCurrent, submitLabel, onSubmit }) {
  const current = withCurrent ? input('currentPassword', { type: 'password', autocomplete: 'current-password', required: true }) : null;
  const next = input('newPassword', { type: 'password', autocomplete: 'new-password', minlength: String(MIN_PASSWORD), required: true });
  const confirm = input('confirmPassword', { type: 'password', autocomplete: 'new-password', required: true });
  const button = h('button', { type: 'submit', class: 'btn btn--primary' }, submitLabel);

  const form = h('form', { class: 'panel panel--padded settings-card', novalidate: true },
    h('div', { class: 'settings-card__icon' }, icon(iconName)),
    h('h2', { class: 'settings-card__title' }, title),
    h('p', { class: 'muted small' }, description),
    current ? field('Current password', current) : null,
    field('New password', next, { hint: `At least ${MIN_PASSWORD} characters` }),
    field('Confirm new password', confirm),
    h('div', { class: 'settings-card__actions' }, button));

  const setError = (control, message) => {
    const slot = form.querySelector(`[data-error-for="${control.name}"]`);
    slot.textContent = message;
    slot.parentElement.classList.toggle('has-error', Boolean(message));
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    [current, next, confirm].filter(Boolean).forEach((control) => setError(control, ''));
    if (current && !current.value) return setError(current, 'Enter your current password');
    if (next.value.length < MIN_PASSWORD) return setError(next, `Use at least ${MIN_PASSWORD} characters`);
    if (next.value !== confirm.value) return setError(confirm, 'Passwords do not match');

    button.disabled = true;
    try {
      await onSubmit({ currentPassword: current?.value, newPassword: next.value });
      form.reset();
    } catch (error) {
      if (error.details?.currentPassword && current) setError(current, error.details.currentPassword);
      else if (error.details?.newPassword) setError(next, error.details.newPassword);
      toast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
    return undefined;
  });
  return form;
}

function downloadCard() {
  const run = (button, path, fallbackName, message) => async () => {
    button.disabled = true;
    try {
      await downloadFile(path, { fallbackName });
      toast(message, 'success');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  };
  const csvButton = h('button', { type: 'button', class: 'btn' }, icon('download'), 'Export full directory (CSV)');
  const backupButton = h('button', { type: 'button', class: 'btn btn--gold' }, icon('database'), 'Download database backup');
  csvButton.addEventListener('click', run(csvButton, '/export/full', 'temple-directory.csv', 'Directory exported.'));
  backupButton.addEventListener('click', run(backupButton, '/backup', 'temple-directory-backup.db', 'Backup downloaded. Keep it somewhere safe.'));

  return h('section', { class: 'panel panel--padded settings-card' },
    h('div', { class: 'settings-card__icon' }, icon('database')),
    h('h2', { class: 'settings-card__title' }, 'Data & backups'),
    h('p', { class: 'muted small' }, 'The CSV opens in Excel or Google Sheets (Tamil text included). The backup is a complete copy of the database — take one every week and store it on a pen drive or cloud folder.'),
    h('div', { class: 'settings-card__stack' }, csvButton, backupButton));
}

export async function renderSettings(ctx) {
  ctx.setTitle('Settings');

  ctx.root.replaceChildren(
    h('section', { class: 'page-head' },
      h('div', { class: 'page-head__text' },
        h('p', { class: 'eyebrow' }, 'Administrator'),
        h('h1', { class: 'page-title' }, 'Settings'),
        h('p', { class: 'page-sub' }, 'Manage sign-in passwords and keep safe copies of the directory.'))),
    registrationLinkCard(ctx.session.temple.name),
    h('div', { class: 'settings-grid' },
      passwordForm({
        title: 'Your admin password',
        description: 'Other devices signed in as admin will be signed out.',
        iconName: 'shield',
        withCurrent: true,
        submitLabel: 'Update admin password',
        onSubmit: async (body) => {
          await api.put('/auth/password', body);
          toast('Admin password updated.', 'success');
        },
      }),
      passwordForm({
        title: 'Viewer password',
        description: 'Share this with volunteers or priests who only need to look up details. Everyone using the viewer login will be signed out.',
        iconName: 'key',
        withCurrent: false,
        submitLabel: 'Set viewer password',
        onSubmit: async ({ newPassword }) => {
          const { data } = await api.put('/auth/viewer-password', { newPassword });
          toast(`Password for “${data.username}” updated.`, 'success');
        },
      }),
      downloadCard()));
  return null;
}
