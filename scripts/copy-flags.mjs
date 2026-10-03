// Kopiert Flaggen nach public/flags/: Länder aus flag-icons (MIT), Bundesländer aus
// Wikimedia Commons (amtliche Werke, gemeinfrei; vorher nach .cache/flags-de/ geladen).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { optimize } from 'svgo';

const file = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const OUT = file('../public/flags/');
const countries = JSON.parse(readFileSync(file('../server/data/countries.json'), 'utf8')).filter((c) => c.target);
mkdirSync(OUT, { recursive: true });

const shrink = (svg) => optimize(svg, { multipass: true, floatPrecision: 2 }).data;
let before = 0;
let after = 0;
const write = (name, svg) => {
  const small = shrink(svg);
  before += svg.length;
  after += small.length;
  writeFileSync(`${OUT}${name}.svg`, small);
};

for (const c of countries) {
  const src = file(`../node_modules/flag-icons/flags/4x3/${c.iso.toLowerCase()}.svg`);
  if (!existsSync(src)) { console.log('Flagge fehlt:', c.iso); continue; }
  write(c.iso.toLowerCase(), readFileSync(src, 'utf8'));
}
const deDir = file('../.cache/flags-de/');
for (const f of readdirSync(deDir).filter((n) => n.endsWith('.svg'))) {
  write(f.replace('.svg', ''), readFileSync(`${deDir}${f}`, 'utf8'));
}
console.log(`Flaggen: ${readdirSync(OUT).length}, ${(before / 1024) | 0} KB → ${(after / 1024) | 0} KB`);
