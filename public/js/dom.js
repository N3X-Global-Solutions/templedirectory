// Tiny DOM helpers. All user data goes through text nodes / attributes — never innerHTML.

const BOOLEAN_PROPS = new Set(['checked', 'disabled', 'selected', 'required', 'hidden', 'multiple', 'readOnly']);

function appendChildren(element, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  const { value, ...rest } = props ?? {};
  for (const [key, prop] of Object.entries(rest)) {
    if (prop === null || prop === undefined || prop === false) continue;
    if (key === 'class') element.className = prop;
    else if (key === 'dataset') Object.assign(element.dataset, prop);
    else if (key.startsWith('on') && typeof prop === 'function') element.addEventListener(key.slice(2).toLowerCase(), prop);
    else if (BOOLEAN_PROPS.has(key)) element[key] = Boolean(prop);
    else element.setAttribute(key, prop === true ? '' : String(prop));
  }
  appendChildren(element, children);
  if (value !== undefined && value !== null) element.value = value;
  return element;
}

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8Z"/>',
  back: '<path d="M15 18 9 12l6-6"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3"/><path d="M7 14h10v7H7Z"/>',
  download: '<path d="M12 3v12m0 0-5-5m5 5 5-5M4 21h16"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .6 3.1 2.4 3.5 5.2"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5Z"/><path d="M4 21.5V4.5M8 7h8M8 11h6"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6 8.5 7 8.5-7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  logout: '<path d="M15 4h4v16h-4M10 17l5-5-5-5M15 12H3"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6Z"/><path d="m9 12 2 2 4-4"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/>',
  lamp: '<path d="M12 2c2.2 3 3.2 5 3.2 6.7a3.2 3.2 0 0 1-6.4 0C8.8 7 9.8 5 12 2Z"/><path d="M3 13h18c-.6 3.9-4.5 6.5-9 6.5S3.6 16.9 3 13ZM9 21h6"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  tag: '<path d="M3 12V3h9l9 9-9 9Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
};

export function icon(name, className = '') {
  const template = document.createElement('template');
  // Only the fixed ICONS map is parsed as markup; anything caller-supplied is applied through the DOM API.
  template.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${Object.hasOwn(ICONS, name) ? ICONS[name] : ''}</svg>`;
  const svg = template.content.firstElementChild;
  svg.classList.add('icon', ...String(className).split(/\s+/).filter(Boolean));
  return svg;
}

export function debounce(fn, waitMs) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

function toastHost() {
  const existing = document.querySelector('.toasts');
  if (existing) return existing;
  const host = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
  document.body.append(host);
  return host;
}

const TOAST_MS = 4200;

export function toast(message, type = 'info') {
  const item = h('div', { class: `toast toast--${type}` }, icon(type === 'error' ? 'close' : type === 'success' ? 'check' : 'lamp'), h('span', {}, message));
  toastHost().append(item);
  setTimeout(() => {
    item.classList.add('is-leaving');
    setTimeout(() => item.remove(), 320);
  }, TOAST_MS);
}

export function confirmDialog({ title, message, confirmText = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': 'dialog-title' },
      h('div', { class: 'dialog__body' },
        h('h2', { class: 'dialog__title', id: 'dialog-title' }, title),
        h('p', { class: 'muted' }, message)),
      h('div', { class: 'dialog__actions' },
        h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => dialog.close('cancel') }, 'Cancel'),
        h('button', { type: 'button', class: `btn ${danger ? 'btn--danger-solid' : 'btn--primary'}`, onclick: () => dialog.close('confirm') }, confirmText)));
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'confirm');
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

export function emptyState({ mark = 'ௐ', title, message, action = null }) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty__mark', 'aria-hidden': 'true' }, mark),
    h('h3', {}, title),
    message ? h('p', {}, message) : null,
    action);
}

export function loadingView() {
  return h('div', { class: 'loading-view', 'aria-busy': 'true', 'aria-label': 'Loading' },
    h('div', { class: 'skeleton', dataset: { w: '40' } }),
    h('div', { class: 'skeleton' }),
    h('div', { class: 'skeleton' }),
    h('div', { class: 'skeleton', dataset: { w: '70' } }));
}

/** Prints only `target` (via .print-target) and restores the page afterwards. */
export function printElement(target) {
  document.body.classList.add('print-single');
  target.classList.add('print-target');
  const restore = () => {
    document.body.classList.remove('print-single');
    target.classList.remove('print-target');
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  window.print();
}
