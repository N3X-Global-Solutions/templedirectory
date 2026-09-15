import { api } from '../api.js';
import { h, icon } from '../dom.js';

const ROLES = [
  { key: 'admin', username: 'admin', title: 'Administrator', text: 'Add, edit and remove records' },
  { key: 'viewer', username: 'viewer', title: 'Viewer', text: 'View details only' },
];

export function renderLogin(root, { branding, onSignedIn }) {
  let role = 'admin';

  const username = h('input', { class: 'input', id: 'login-username', name: 'username', autocomplete: 'username', required: true, value: 'admin', maxlength: '60' });
  const password = h('input', { class: 'input', id: 'login-password', name: 'password', type: 'password', autocomplete: 'current-password', required: true, maxlength: '200' });
  const error = h('p', { class: 'login-card__error', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn--primary btn--block' }, 'Enter the directory');

  const togglePassword = h('button', {
    type: 'button', class: 'input-affix', 'aria-label': 'Show password',
    onclick: () => {
      const showing = password.type === 'text';
      password.type = showing ? 'password' : 'text';
      togglePassword.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      togglePassword.classList.toggle('is-on', !showing);
    },
  }, icon('eye'));

  const roleButtons = ROLES.map((item) => h('button', {
    type: 'button',
    class: `role-option${item.key === role ? ' is-selected' : ''}`,
    'aria-pressed': String(item.key === role),
    onclick: () => selectRole(item),
  },
  h('span', { class: 'role-option__icon' }, icon(item.key === 'admin' ? 'shield' : 'eye')),
  h('span', { class: 'role-option__text' },
    h('strong', {}, item.title),
    h('span', {}, item.text))));

  function selectRole(item) {
    role = item.key;
    username.value = item.username;
    roleButtons.forEach((button, index) => {
      const selected = ROLES[index].key === role;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    password.value = '';
    error.textContent = '';
    password.focus();
  }

  const form = h('form', {
    class: 'login-card', novalidate: true,
    onsubmit: async (event) => {
      event.preventDefault();
      error.textContent = '';
      if (!username.value.trim() || !password.value) {
        error.textContent = 'Enter your username and password.';
        return;
      }
      submit.disabled = true;
      submit.textContent = 'Opening…';
      try {
        const { data } = await api.post('/auth/login', { username: username.value.trim(), password: password.value });
        onSignedIn(data);
      } catch (err) {
        error.textContent = err.message;
        password.select();
      } finally {
        submit.disabled = false;
        submit.textContent = 'Enter the directory';
      }
    },
  },
  h('p', { class: 'eyebrow' }, 'Welcome'),
  h('h2', { class: 'login-card__title' }, 'Sign in'),
  h('div', { class: 'role-switch', role: 'group', 'aria-label': 'Choose login type' }, roleButtons),
  h('div', { class: 'field' },
    h('label', { class: 'field__label', for: 'login-username' }, 'Username'),
    username),
  h('div', { class: 'field' },
    h('label', { class: 'field__label', for: 'login-password' }, 'Password'),
    h('div', { class: 'input-with-affix' }, password, togglePassword)),
  error,
  submit);

  const screen = h('div', { class: 'login' },
    h('section', { class: 'login__art', 'aria-hidden': 'true' },
      h('div', { class: 'login__rays' }),
      h('div', { class: 'login__gopuram' }),
      h('div', { class: 'login__art-text' },
        h('span', { class: 'login__om' }, 'ௐ'),
        h('p', { class: 'login__blessing' }, 'குலதெய்வம் துணை'),
        h('p', { class: 'login__blessing-en' }, 'May our family deity guide us'))),
    h('section', { class: 'login__panel' },
      h('header', { class: 'login__brand' },
        h('h1', { class: 'login__temple' }, branding.name),
        h('p', { class: 'login__tagline' }, branding.tagline || 'Devotee & Donor Directory')),
      form,
      h('p', { class: 'login__foot' }, 'Records of devotees, families and donors — kept with care.')));

  root.replaceChildren(screen);
  password.focus();
}
