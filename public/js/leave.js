// "Verlassen"-Knopf im laufenden Spiel: zweimal tippen, damit niemand versehentlich rausfliegt.
import { h, toast } from './dom.js';

const CONFIRM_MS = 3000;

/** Small leave button for the HUD. */
export function leaveButton(app) {
  let armedUntil = 0;
  const btn = h('button.hud-leave', {
    'aria-label': 'Spiel verlassen',
    onclick: () => {
      if (performance.now() < armedUntil) {
        app.send('leaveLobby');
        return;
      }
      armedUntil = performance.now() + CONFIRM_MS;
      btn.classList.add('armed');
      btn.textContent = 'Wirklich?';
      toast('Nochmal tippen, um das Spiel zu verlassen.', CONFIRM_MS);
      setTimeout(() => { btn.classList.remove('armed'); btn.textContent = '✕'; }, CONFIRM_MS);
    },
  }, '✕');
  return btn;
}
