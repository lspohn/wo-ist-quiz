// Kopiert Flaggen nach public/flags/: Länder aus flag-icons (MIT), Bundesländer aus
// Wikimedia Commons (Bundesländer: amtliche Werke, gemeinfrei; US-Staaten: gemeinfrei),
// vorher nach .cache/flags-de/ bzw. .cache/flags-us/ geladen.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { optimize } from 'svgo';

const file = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const OUT = file('../public/flags/');
const countries = JSON.parse(readFileSync(file('../server/data/countries.json'), 'utf8')).filter((c) => c.target);
mkdirSync(OUT, { recursive: true });

const MAX_SVG = 60 * 1024;
const shrink = (svg) => optimize(svg, { multipass: true, floatPrecision: 2 }).data;

// Sehr detailreiche Flaggen (Siegel, Wappen) als kleines WebP in eine SVG-Hülle packen –
// angezeigt werden sie ohnehin nur ~30 px hoch.
async function rasterize(svg) {
  const img = sharp(Buffer.from(svg), { density: 150 }).resize({ height: 120 });
  const { width, height } = await img.metadata().then(async () => (await img.clone().toBuffer({ resolveWithObject: true })).info);
  const webp = await img.webp({ quality: 82 }).toBuffer();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="data:image/webp;base64,${webp.toString('base64')}"/></svg>`;
}

let before = 0;
let after = 0;
let rasterized = 0;
async function write(name, svg) {
  let out = shrink(svg);
  if (out.length > MAX_SVG) { out = await rasterize(svg); rasterized += 1; }
  before += svg.length;
  after += out.length;
  writeFileSync(`${OUT}${name}.svg`, out);
}

for (const c of countries) {
  const src = file(`../node_modules/flag-icons/flags/4x3/${c.iso.toLowerCase()}.svg`);
  if (!existsSync(src)) { console.log('Flagge fehlt:', c.iso); continue; }
  await write(c.iso.toLowerCase(), readFileSync(src, 'utf8'));
}
for (const dir of ['flags-de', 'flags-us']) {
  const base = file(`../.cache/${dir}/`);
  if (!existsSync(base)) { console.log(`Fehlt: .cache/${dir} (siehe Kopfkommentar)`); continue; }
  for (const f of readdirSync(base).filter((n) => n.endsWith('.svg'))) await write(f.replace('.svg', ''), readFileSync(`${base}${f}`, 'utf8'));
}
console.log(`Flaggen: ${readdirSync(OUT).length}, ${(before / 1024) | 0} KB → ${(after / 1024) | 0} KB, davon ${rasterized} gerastert`);
