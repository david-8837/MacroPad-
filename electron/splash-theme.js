// Loaded synchronously in the head before the splash can paint.
const theme = new URLSearchParams(window.location.search).get('theme');
document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
