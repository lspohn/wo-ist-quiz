/** Tiny element factory: h('div.cls', {onclick}, ...children) */
export function h(spec, props = {}, ...children) {
  const [tag, ...classes] = spec.split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('--')) el.style.setProperty(k, v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Small flag image; disappears silently if the file is missing. */
export function flag(code, cls = 'flag') {
  if (!code) return null;
  return h(`img.${cls}`, { src: `/flags/${code}.svg`, alt: '', loading: 'lazy', decoding: 'async', onerror: (e) => e.target.remove() });
}

/** Country/place name with asterisk + footnote for disputed states. */
export function noted(name, note) {
  return note ? [name, h('sup.star', { title: note }, '*')] : [name];
}

/** replaceChildren that skips null/false (the DOM API would print "null"). */
export function fill(el, ...children) {
  el.replaceChildren(...children.flat().filter((c) => c != null && c !== false));
}

let toastTimer;
/** Short message at the bottom of the screen. */
export function toast(text, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export const fmt = (n) => Number(n).toLocaleString('de-DE');

export const CATEGORY_LABEL = {
  exact: 'Volltreffer',
  neighbor: 'Nachbarland',
  close: 'Knapp daneben',
  continent: 'Richtiger Kontinent',
  far: 'Falscher Kontinent',
  veryfar: 'Weit, weit weg',
  none: 'Keine Antwort',
  de_neighbor: 'Nachbarland',
  de_far: 'Daneben',
  eu_far: 'Falsche Ecke Europas',
  p_close: 'Knapp daneben',
  p_near: 'In der Gegend',
  p_far: 'Weit daneben',
  p_veryfar: 'Weit, weit weg',
};
