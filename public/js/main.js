import { api } from './api.js';
import { h, icon, loadingView, emptyState, toast } from './dom.js';
import { renderLogin } from './views/login.js';
import { renderDirectory } from './views/directory.js';
import { renderDevoteeDetail } from './views/detail.js';
import { renderDevoteeForm } from './views/form.js';
import { renderMailing } from './views/mailing.js';
import { renderPooja } from './views/pooja.js';
import { renderSettings } from './views/settings.js';

const ROUTES = [
  { pattern: /^\/directory$/, nav: 'directory', render: (ctx) => renderDirectory(ctx) },
  { pattern: /^\/devotees\/new$/, nav: 'directory', adminOnly: true, render: (ctx) => renderDevoteeForm(ctx, null) },
  { pattern: /^\/devotees\/(\d+)$/, nav: 'directory', render: (ctx, [id]) => renderDevoteeDetail(ctx, Number(id)) },
  { pattern: /^\/devotees\/(\d+)\/edit$/, nav: 'directory', adminOnly: true, render: (ctx, [id]) => renderDevoteeForm(ctx, Number(id)) },
  { pattern: /^\/pooja$/, nav: 'pooja', render: (ctx) => renderPooja(ctx) },
  { pattern: /^\/mailing$/, nav: 'mailing', render: (ctx) => renderMailing(ctx) },
  { pattern: /^\/settings$/, nav: 'settings', adminOnly: true, render: (ctx) => renderSettings(ctx) },
];

const NAV_ITEMS = [
  { key: 'directory', href: '#/directory', label: 'Directory', icon: 'book' },
  { key: 'pooja', href: '#/pooja', label: 'Pooja Lookup', icon: 'star' },
  { key: 'mailing', href: '#/mailing', label: 'Mailing', icon: 'mail' },
  { key: 'settings', href: '#/settings', label: 'Settings', icon: 'settings', adminOnly: true },
];

let session = null;
let branding = { name: 'Sri Angalamman kovil', tagline: '' };
let cleanup = null;
let renderToken = 0;

const appRoot = () => document.getElementById('app');

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/directory';
  const [path, queryString = ''] = raw.split('?');
  return { path, query: new URLSearchParams(queryString) };
}

function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

/** Updates the query part of the URL without re-rendering (filters, search, paging). */
function setQuery(params) {
  const { path } = parseHash();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== null && value !== undefined) query.set(key, String(value));
  }
  const text = query.toString();
  history.replaceState(null, '', `#${path}${text ? `?${text}` : ''}`);
}

async function signOut() {
  try {
    await api.post('/auth/logout');
  } catch {
    // Session may already be gone; signing out locally is still correct.
  }
  session = null;
  history.replaceState(null, '', '#/directory');
  route();
}

function buildShell() {
  const isAdmin = session.user.role === 'admin';
  const nav = h('nav', { class: 'main-nav', 'aria-label': 'Main navigation' },
    NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) =>
      h('a', { class: 'main-nav__link', href: item.href, dataset: { nav: item.key } },
        icon(item.icon), h('span', { class: 'main-nav__label' }, item.label))));

  return h('div', { class: 'shell' },
    h('header', { class: 'site-header' },
      h('div', { class: 'site-header__inner' },
        h('a', { class: 'brand', href: '#/directory' },
          h('span', { class: 'brand__om', 'aria-hidden': 'true' }, 'ௐ'),
          h('span', { class: 'brand__text' },
            h('span', { class: 'brand__name' }, session.temple.name),
            h('span', { class: 'brand__tag' }, session.temple.tagline))),
        nav,
        h('div', { class: 'user-chip' },
          h('span', { class: 'user-chip__who' },
            h('span', { class: 'user-chip__name' }, session.user.username),
            h('span', { class: 'user-chip__role' }, isAdmin ? 'Administrator' : 'Viewer · read only')),
          h('button', { type: 'button', class: 'btn btn--ghost-light btn--sm', onclick: signOut, title: 'Sign out' },
            icon('logout'), h('span', { class: 'main-nav__label' }, 'Sign out'))))),
    h('div', { class: 'thoranam', 'aria-hidden': 'true' }),
    h('main', { class: 'page', id: 'view', tabindex: '-1' }));
}

function ensureShell() {
  const root = appRoot();
  const existing = root.querySelector('.shell');
  if (existing && existing.dataset.user === session.user.username) return existing;
  const shell = buildShell();
  shell.dataset.user = session.user.username;
  root.replaceChildren(shell);
  return shell;
}

function highlightNav(shell, key) {
  shell.querySelectorAll('.main-nav__link').forEach((link) => {
    const active = link.dataset.nav === key;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function runCleanup() {
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
}

async function route() {
  runCleanup();
  const token = ++renderToken;

  if (!session) {
    document.title = `Sign in · ${branding.name}`;
    renderLogin(appRoot(), {
      branding,
      onSignedIn: (payload) => {
        session = payload;
        route();
      },
    });
    return;
  }

  const { path, query } = parseHash();
  const match = ROUTES.map((r) => ({ route: r, groups: path.match(r.pattern) })).find((m) => m.groups);
  if (!match) {
    history.replaceState(null, '', '#/directory');
    route();
    return;
  }
  if (match.route.adminOnly && session.user.role !== 'admin') {
    toast('That page is available to the administrator only.', 'error');
    history.replaceState(null, '', '#/directory');
    route();
    return;
  }

  const shell = ensureShell();
  highlightNav(shell, match.route.nav);
  const view = shell.querySelector('#view');
  const container = h('div', { class: 'view' }, loadingView());
  view.replaceChildren(container);
  window.scrollTo({ top: 0 });

  const ctx = {
    root: container,
    query,
    session,
    navigate,
    setQuery,
    setTitle: (title) => { document.title = `${title} · ${session.temple.name}`; },
    isCurrent: () => token === renderToken,
  };

  try {
    const result = await match.route.render(ctx, match.groups.slice(1));
    if (token === renderToken) cleanup = result ?? null;
    else if (typeof result === 'function') result();
  } catch (error) {
    if (token !== renderToken || error.status === 401) return;
    container.replaceChildren(emptyState({
      mark: '!',
      title: error.status === 404 ? 'Record not found' : 'Something went wrong',
      message: error.message,
      action: h('a', { class: 'btn btn--primary', href: '#/directory' }, 'Back to directory'),
    }));
  }
}

async function boot() {
  const brandingResult = await api.get('/auth/branding').catch(() => null);
  if (brandingResult) branding = brandingResult.data;

  try {
    session = (await api.get('/auth/session')).data;
  } catch (error) {
    session = null;
    if (error.status !== 401) toast(error.message, 'error');
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('auth:expired', () => {
    if (!session) return;
    session = null;
    toast('Your session has ended. Please sign in again.');
    route();
  });
  route();
}

const BADGE_IDLE_MS = 900;

/** Shrinks the fixed credits badge to its lamp while scrolling; full text returns once scrolling stops. */
function watchCreditsBadge() {
  const badge = document.querySelector('.crafted-badge');
  if (!badge) return;
  let idleTimer = null;
  window.addEventListener('scroll', () => {
    badge.classList.add('is-compact');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => badge.classList.remove('is-compact'), BADGE_IDLE_MS);
  }, { passive: true });
}

watchCreditsBadge();
boot();
