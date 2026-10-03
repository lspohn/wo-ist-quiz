/** Shuffled draw pile per key (mode + difficulty): every question once before any repeats. */
export class Deck {
  constructor(poolFor, random = Math.random) {
    this.poolFor = poolFor;
    this.random = random;
    this.piles = new Map();
    this.last = null;
  }

  draw(key) {
    let pile = this.piles.get(key);
    if (!pile?.length) {
      pile = shuffle([...this.poolFor(key)], this.random);
      // nach dem Neumischen nicht direkt dasselbe Land wie zuletzt
      const same = (a, b) => a && b && (a.key ?? a) === (b.key ?? b);
      if (pile.length > 1 && same(pile[pile.length - 1], this.last)) [pile[0], pile[pile.length - 1]] = [pile[pile.length - 1], pile[0]];
      this.piles.set(key, pile);
    }
    this.last = pile.pop();
    return this.last;
  }
}

function shuffle(arr, random) {
  for (let k = arr.length - 1; k > 0; k--) {
    const j = Math.floor(random() * (k + 1));
    [arr[k], arr[j]] = [arr[j], arr[k]];
  }
  return arr;
}
