import { COMMENTS } from './data/comments.js';

/** Fill {name}/{ziel}/{tipp}/{km} placeholders. */
export function fillTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (m, key) => (vars[key] ?? m));
}

/** Picks comments without repeats until a category is exhausted (per game). */
export class CommentPicker {
  constructor(random = Math.random, comments = COMMENTS) {
    this.random = random;
    this.comments = comments;
    this.used = new Map();
  }

  pick(category, vars) {
    const list = this.comments[category] ?? this.comments.none;
    let used = this.used.get(category);
    if (!used || used.size >= list.length) {
      used = new Set();
      this.used.set(category, used);
    }
    const free = list.map((_, idx) => idx).filter((idx) => !used.has(idx));
    const idx = free[Math.floor(this.random() * free.length)];
    used.add(idx);
    return fillTemplate(list[idx], vars);
  }
}
