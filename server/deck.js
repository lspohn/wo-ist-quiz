/** Shuffled draw pile per difficulty: every country once before any repeats. */
export class Deck {
  constructor(poolFor, random = Math.random) {
    this.poolFor = poolFor;
    this.random = random;
    this.piles = new Map();
    this.last = null;
  }

  draw(difficulty) {
    let pile = this.piles.get(difficulty);
    if (!pile?.length) {
      pile = shuffle([...this.poolFor(difficulty)], this.random);
      // nach dem Neumischen nicht direkt dasselbe Land wie zuletzt
      if (pile.length > 1 && pile[pile.length - 1] === this.last) [pile[0], pile[pile.length - 1]] = [pile[pile.length - 1], pile[0]];
      this.piles.set(difficulty, pile);
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
