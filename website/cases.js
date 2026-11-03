(() => {
  'use strict';
  const grid = document.getElementById('case-grid');
  const empty = document.getElementById('cases-empty');
  if (!grid || !empty) return;
  const models = Array.isArray(window.ZERO_CASE_MODELS) ? window.ZERO_CASE_MODELS : [];
  // Use same-site files so the download attribute works and no untrusted HTML is rendered.
  const localUrl = value => {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, document.baseURI);
      const base = new URL(document.baseURI);
      if (!['http:', 'https:', 'file:'].includes(url.protocol) || url.protocol !== base.protocol || url.origin !== base.origin) return null;
      return url.href;
    } catch (_) { return null; }
  };
  for (const model of models) {
    if (!model || typeof model.title !== 'string' || !model.title.trim()) continue;
    const image = localUrl(model.image), file = localUrl(model.file);
    if (!image || !file) continue;
    const title = model.title.trim();
    const card = document.createElement('article');
    card.className = 'case-card';
    const picture = document.createElement('img');
    picture.src = image;
    picture.alt = `${title} case model`;
    picture.loading = 'lazy';
    const info = document.createElement('div');
    info.className = 'case-card-info';
    const heading = document.createElement('h3');
    heading.textContent = title;
    const link = document.createElement('a');
    link.className = 'button button-dark';
    link.href = file;
    link.setAttribute('download', '');
    link.setAttribute('aria-label', `Download ${title} case model`);
    link.append('Download model ');
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↓';
    link.append(arrow);
    info.append(heading, link);
    card.append(picture, info);
    grid.append(card);
  }
  empty.hidden = grid.children.length > 0;
})();
