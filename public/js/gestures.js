// Pan, Pinch-Zoom, Mausrad und Long-Press auf einer Fläche.
// Ein Land wird nur per Long-Press gewählt; jede Bewegung bricht ihn ab.

const LONG_PRESS_MS = 550;
const MOVE_TOLERANCE = 10;

/**
 * @param {HTMLElement} el surface receiving pointer events
 * @param {object} view { get(): {k,x,y}, set(k,x,y), clampK(k) }
 * @param {object} cb { onLongPressStart(x,y), onLongPressCancel(), onLongPress(x,y), onChange() }
 */
export function attachGestures(el, view, cb) {
  const pointers = new Map();
  let press = null;
  let pinch = null;
  let inertia = null;
  let lastMoves = [];

  const cancelPress = () => {
    if (!press) return;
    clearTimeout(press.timer);
    press = null;
    cb.onLongPressCancel?.();
  };

  const startPinch = () => {
    const [a, b] = [...pointers.values()];
    const s = view.get();
    pinch = {
      dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      k: s.k, x: s.x, y: s.y,
    };
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    cancelAnimationFrame(inertia);
    el.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    lastMoves = [];
    if (pointers.size === 1) {
      const { clientX: x, clientY: y } = e;
      press = {
        x, y,
        timer: setTimeout(() => {
          const p = press;
          press = null;
          if (p && pointers.size === 1) cb.onLongPress?.(p.x, p.y);
        }, LONG_PRESS_MS),
      };
      cb.onLongPressStart?.(x, y, LONG_PRESS_MS);
    } else {
      cancelPress();
      if (pointers.size === 2) startPinch();
    }
  });

  el.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (press && Math.hypot(p.x - p.sx, p.y - p.sy) > MOVE_TOLERANCE) cancelPress();
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const k = view.clampK(pinch.k * (dist / pinch.dist));
      // Weltpunkt unter dem Startmittelpunkt bleibt unter dem aktuellen Mittelpunkt
      const wx = (pinch.cx - pinch.x) / pinch.k;
      const wy = (pinch.cy - pinch.y) / pinch.k;
      view.set(k, cx - wx * k, cy - wy * k);
      cb.onChange?.();
    } else if (pointers.size === 1 && !press) {
      const s = view.get();
      view.set(s.k, s.x + dx, s.y + dy);
      lastMoves.push({ dx, dy, t: performance.now() });
      if (lastMoves.length > 5) lastMoves.shift();
      cb.onChange?.();
    }
  });

  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    cancelPress();
    if (pointers.size === 2) {
      // dritter Finger weg: neue Pinch-Referenz, sonst springt der Zoom
      startPinch();
    } else if (pointers.size === 1) {
      // Nach Pinch weiter mit einem Finger schieben, ohne Sprung
      pinch = null;
      lastMoves = [];
    } else if (pointers.size === 0) {
      pinch = null;
      startInertia();
      cb.onSettle?.();
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);

  function startInertia() {
    const now = performance.now();
    const recent = lastMoves.filter((m) => now - m.t < 80);
    if (!recent.length) return;
    let vx = recent.reduce((s, m) => s + m.dx, 0) / recent.length;
    let vy = recent.reduce((s, m) => s + m.dy, 0) / recent.length;
    const step = () => {
      vx *= 0.92;
      vy *= 0.92;
      if (Math.abs(vx) < 0.3 && Math.abs(vy) < 0.3) { cb.onSettle?.(); return; }
      const s = view.get();
      view.set(s.k, s.x + vx, s.y + vy);
      cb.onChange?.();
      inertia = requestAnimationFrame(step);
    };
    inertia = requestAnimationFrame(step);
  }

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    cancelPress();
    const s = view.get();
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
    const rect = el.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const k = view.clampK(s.k * factor);
    view.set(k, px - ((px - s.x) / s.k) * k, py - ((py - s.y) / s.k) * k);
    cb.onChange?.();
    cb.onSettle?.();
  }, { passive: false });

  el.addEventListener('contextmenu', (e) => e.preventDefault());

  /** Forget all in-flight gestures (phase change, programmatic view change). */
  function reset() {
    cancelPress();
    cancelAnimationFrame(inertia);
    pointers.clear();
    pinch = null;
    lastMoves = [];
  }

  return { cancel: cancelPress, reset, stopInertia: () => cancelAnimationFrame(inertia) };
}
