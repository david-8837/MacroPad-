const loading = document.getElementById('loading');
const error = document.getElementById('error');
const progressBar = document.getElementById('progress-bar');
window.startup.onFailure(() => {
  loading.style.display = 'none';
  if (progressBar) progressBar.style.display = 'none';
  error.style.display = 'block';
  document.getElementById('retry').focus();
});
document.getElementById('retry').addEventListener('click', () => {
  error.style.display = 'none';
  loading.style.display = 'block';
  if (progressBar) progressBar.style.display = 'block';
  window.startup.retry();
});
document.getElementById('quit').addEventListener('click', () => window.startup.quit());
