// Treffer-Hilfe für kleine Länder: Was auf dem Bildschirm winzig ist, bekommt einen
// Fangbereich von etwa der halben eigenen Größe (min. 8 px, max. 20 px) rundherum –
// grob die 3–4-fache Fläche. Große Länder sind davon nur direkt am Rand betroffen.

const TINY_PX = 28;
const MIN_MARGIN = 8;
const MAX_MARGIN = 20;
const RADII = [4, 8, 12, 16, 20];
const ANGLES = 16;

function idAt(x, y) {
  const hit = document.elementFromPoint(x, y)?.closest?.('[data-i]');
  return hit ? Number(hit.getAttribute('data-i')) : null;
}

/** Build a picker; `sizePx(i)` returns the country's current on-screen size. */
export function createPicker(sizePx) {
  const margin = (i) => Math.max(MIN_MARGIN, Math.min(MAX_MARGIN, sizePx(i) * 0.5));

  return function pick(x, y) {
    const direct = idAt(x, y);
    if (direct !== null && sizePx(direct) < TINY_PX) return direct;
    let best = null;
    for (const r of RADII) {
      for (let a = 0; a < ANGLES; a++) {
        const ang = (a / ANGLES) * Math.PI * 2;
        const id = idAt(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
        if (id === null || id === direct || sizePx(id) >= TINY_PX || r > margin(id)) continue;
        if (!best || r < best.r || (r === best.r && sizePx(id) < sizePx(best.id))) best = { id, r };
      }
      if (best) break;
    }
    return best ? best.id : direct;
  };
}

const POINT_RADIUS_PX = 26;

/** Nearest visible city point within reach of the touch (screen space). */
export function pickPoint(points, toScreen, x, y) {
  let best = null;
  let bestD = POINT_RADIUS_PX;
  for (const p of points) {
    const [sx, sy] = toScreen(p.x, p.y);
    const d = Math.hypot(sx - x, sy - y);
    if (d < bestD) { bestD = d; best = p.i; }
  }
  return best;
}
