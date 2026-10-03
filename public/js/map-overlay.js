// HTML-Ebene über der Karte: Pins, Ziel-Puls, Auswahlring.
// Bewusst kein SVG-Text – den rendert Safari bei skalierten Gruppen nicht zuverlässig.
import { h } from './dom.js';

/** Overlay positioned in screen space; `project([x,y])` maps world → screen. */
export function createOverlay(host, project) {
  const layer = h('div.map-overlay', { 'aria-hidden': 'true' });
  const NS = 'http://www.w3.org/2000/svg';
  const lineSvg = document.createElementNS(NS, 'svg');
  lineSvg.setAttribute('class', 'guess-lines');
  layer.append(lineSvg);
  host.append(layer);
  let items = [];
  let lines = [];

  function place() {
    for (const ln of lines) {
      const [x1, y1] = project(ln.from);
      const [x2, y2] = project(ln.to);
      ln.el.setAttribute('x1', x1.toFixed(1)); ln.el.setAttribute('y1', y1.toFixed(1));
      ln.el.setAttribute('x2', x2.toFixed(1)); ln.el.setAttribute('y2', y2.toFixed(1));
    }
    for (const it of items) {
      const [x, y] = project(it.at);
      it.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
  }

  function add(el, at, kind) {
    layer.append(el);
    items.push({ el, at, kind });
  }

  function clear(kind) {
    items = items.filter((it) => {
      if (kind && it.kind !== kind) return true;
      it.el.remove();
      return false;
    });
  }

  return {
    place,
    clear,
    /** pins: [{ at:[x,y], color, label, me, offset }] */
    setPins(pins) {
      clear('pin');
      pins.forEach((p, idx) => {
        const el = h(`div.pin${p.me ? '.pin-me' : ''}`, { '--c': p.color, '--delay': `${idx * 90}ms`, '--dx': `${p.offset * 26}px` },
          h('span.pin-head', {}, p.label),
        );
        add(el, p.at, 'pin');
      });
      place();
    },
    /** Dashed lines from each guess to the target: [{ from, to, color, me }] */
    setLines(list) {
      lineSvg.replaceChildren();
      lines = list.map((l) => {
        const el = document.createElementNS(NS, 'line');
        el.setAttribute('class', l.me ? 'guess-line me' : 'guess-line');
        el.style.setProperty('--c', l.color);
        lineSvg.append(el);
        return { ...l, el };
      });
      place();
    },
    setPing(at) {
      clear('ping');
      if (at) add(h('div.ping', {}, h('span', {}), h('span', {}), h('span', {})), at, 'ping');
      place();
    },
    setRing(at) {
      clear('ring');
      if (at) add(h('div.cand-ring', {}), at, 'ring');
      place();
    },
  };
}
