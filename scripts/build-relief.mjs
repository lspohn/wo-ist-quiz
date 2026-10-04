// Erzeugt je Karte ein Relief-Overlay (public/relief/<karte>.webp) aus Natural Earth
// „Shaded Relief“ 1:10m (SR_HR, reine Schummerung ohne Höhenfarben, Public Domain). Ohne GDAL: Für jedes Bildpixel wird die
// Kartenprojektion invertiert und das Quellraster (Plattkarte) bilinear abgetastet. Eine Maske aus
// den eigenen Landflächen verhindert, dass das Relief ins Meer läuft. Ausgabe: Schatten dunkel,
// Sonnenhänge hell, flaches Land durchsichtig.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { geoAlbersUsa, geoConicConformal, geoNaturalEarth1 } from 'd3-geo';
import sharp from 'sharp';
import { file } from './lib/regional.mjs';

const SRC_ZIP = 'https://naciscdn.org/naturalearth/10m/raster/SR_HR.zip';
const SRC = file('.cache/relief/SR_HR.tif');
const MAPS = { world: 1, europe: 1.2, germany: 1, usa: 1.2 }; // Bildauflösung je Karteneinheit
const SHADOW = 0.62;
const LIGHT = 0.32;

if (!existsSync(SRC)) {
  const zip = file('.cache/SR_HR.zip');
  if (!existsSync(zip)) execFileSync('curl', ['-sfL', '-o', zip, SRC_ZIP]);
  execFileSync('unzip', ['-o', '-q', zip, '-d', file('.cache/relief')]);
}
// sharp liefert Graustufen-TIFFs sonst als RGB – genau einen Kanal anfordern
const src = await sharp(SRC, { limitInputPixels: false }).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
if (src.info.channels !== 1) throw new Error(`Erwartet 1 Kanal, erhalten ${src.info.channels}`);
const SW = src.info.width;
const SH = src.info.height;
const pixels = src.data;

function sample(lon, lat) {
  const fx = ((lon + 180) / 360) * SW - 0.5;
  const fy = ((90 - lat) / 180) * SH - 0.5;
  const x0 = Math.max(0, Math.min(SW - 2, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(SH - 2, Math.floor(fy)));
  const tx = fx - x0;
  const ty = fy - y0;
  const i = y0 * SW + x0;
  const top = pixels[i] * (1 - tx) + pixels[i + 1] * tx;
  const bottom = pixels[i + SW] * (1 - tx) + pixels[i + SW + 1] * tx;
  return top * (1 - ty) + bottom * ty;
}

function projectionOf(p) {
  const base = p.type === 'albersUsa' ? geoAlbersUsa()
    : p.type === 'naturalEarth1' ? geoNaturalEarth1()
      : geoConicConformal().parallels(p.parallels).rotate(p.rotate);
  return base.scale(p.scale).translate(p.translate);
}

async function landMask(map, w, h) {
  const paths = [...(map.c ?? map.states).map((a) => a.d), ...(map.context ?? [])].filter(Boolean);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${map.w} ${map.h}">`
    + `<g fill="#fff">${paths.map((d) => `<path d="${d}"/>`).join('')}</g></svg>`;
  return sharp(Buffer.from(svg), { limitInputPixels: false }).greyscale().raw().toBuffer();
}

mkdirSync(file('public/relief'), { recursive: true });
for (const [name, scale] of Object.entries(MAPS)) {
  const map = JSON.parse(readFileSync(file(`public/data/${name === 'world' ? 'map' : name}.json`), 'utf8'));
  const projection = projectionOf(map.proj);
  const w = Math.round(map.w * scale);
  const h = Math.round(map.h * scale);
  const mask = await landMask(map, w, h);
  const value = new Float32Array(w * h).fill(NaN);
  const land = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (mask[k] < 128) continue;
      const ll = projection.invert([(x + 0.5) / scale, (y + 0.5) / scale]);
      if (!ll || Number.isNaN(ll[0])) continue;
      value[k] = sample(ll[0], ll[1]);
      if ((k & 7) === 0) land.push(value[k]);
    }
  }
  // Flaches Land (häufigster Helligkeitswert) wird durchsichtig, Abweichungen werden Schatten/Licht
  const histogram = new Array(256).fill(0);
  for (const v of land) histogram[Math.round(v)] += 1;
  const flat = histogram.indexOf(Math.max(...histogram));
  const out = Buffer.alloc(w * h * 2);
  for (let k = 0; k < w * h; k++) {
    const v = value[k];
    if (Number.isNaN(v)) continue;
    const d = (v - flat) / 60;
    out[k * 2] = d < 0 ? 0 : 255;
    out[k * 2 + 1] = Math.round(255 * Math.min(1, Math.abs(d)) * (d < 0 ? SHADOW : LIGHT));
  }
  const target = file(`public/relief/${name}.webp`);
  await sharp(out, { raw: { width: w, height: h, channels: 2 } }).webp({ quality: 55, alphaQuality: 50, effort: 6 }).toFile(target);
  console.log(`${name}: ${w}×${h}, flach=${flat.toFixed(0)}, ${(readFileSync(target).length / 1024) | 0} KB`);
}
