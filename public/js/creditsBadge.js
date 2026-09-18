// Shrinks the fixed "Crafted with devotion" badge to its lamp while the page scrolls,
// so rows and buttons passing behind it stay readable. Shared by the app and the public form.
const IDLE_MS = 900;

export function watchCreditsBadge() {
  const badge = document.querySelector('.crafted-badge');
  if (!badge) return;
  let idleTimer = null;
  window.addEventListener('scroll', () => {
    badge.classList.add('is-compact');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => badge.classList.remove('is-compact'), IDLE_MS);
  }, { passive: true });
}
