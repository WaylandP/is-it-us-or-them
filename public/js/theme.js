// Runs before styles paint; preference is optional and local to this browser.
(() => {
  let theme = 'system';
  try { theme = localStorage.getItem('iuot-theme') || 'system'; } catch { /* Storage may be unavailable. */ }
  if (!['system', 'light', 'dark'].includes(theme)) theme = 'system';
  document.documentElement.dataset.theme = theme;
  document.addEventListener('DOMContentLoaded', () => {
    const control = document.getElementById('theme-select');
    if (!control) return;
    control.value = theme;
    control.addEventListener('change', () => {
      document.documentElement.dataset.theme = control.value;
      try { localStorage.setItem('iuot-theme', control.value); } catch { /* Keep the current tab usable. */ }
    });
  });
})();
