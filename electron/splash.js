const loading = document.getElementById('loading');
const error = document.getElementById('error');
window.startup.onFailure(() => {
  loading.style.display = 'none';
  error.style.display = 'block';
  document.getElementById('retry').focus();
});
document.getElementById('retry').addEventListener('click', () => {
  error.style.display = 'none';
  loading.style.display = 'block';
  window.startup.retry();
});
document.getElementById('quit').addEventListener('click', () => window.startup.quit());
