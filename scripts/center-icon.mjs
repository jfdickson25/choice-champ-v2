import { Jimp } from 'jimp';

const SRC = '/Users/danieldickson/GitHub/choice-champ-v2/public/logo.png';
const OUT = '/Users/danieldickson/GitHub/choice-champ-v2/public/img/icon.png';
const CANVAS_SIZE = 512;          // final icon dimensions
const TARGET_FILL = 0.78;         // logo occupies ~78% of canvas (so ~11% padding each side)
const BG_HEX = 0x312E2EFF;

const src = await Jimp.read(SRC);

// Find bbox AND weighted centroid of non-transparent pixels. The
// centroid gives the optical center (the wheel's visual mass) rather
// than the bbox's geometric center — important here because the
// pointer needle extends above the wheel and pulls the bbox's upper
// edge up, leaving the wheel itself sitting below bbox-center.
let minX = src.bitmap.width, minY = src.bitmap.height, maxX = -1, maxY = -1;
let sumX = 0, sumY = 0, count = 0;
src.scan(0, 0, src.bitmap.width, src.bitmap.height, (x, y, idx) => {
    const a = src.bitmap.data[idx + 3];
    if (a > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        sumX += x;
        sumY += y;
        count += 1;
    }
});

const bboxW = maxX - minX + 1;
const bboxH = maxY - minY + 1;
const bboxSide = Math.max(bboxW, bboxH);
const centroidInBboxX = sumX / count - minX;
const centroidInBboxY = sumY / count - minY;
console.log(`bbox: x=${minX}..${maxX} y=${minY}..${maxY} (${bboxW}x${bboxH}, max side ${bboxSide})`);
console.log(`centroid (in bbox): (${centroidInBboxX.toFixed(1)}, ${centroidInBboxY.toFixed(1)})  bbox-center: (${(bboxW/2).toFixed(1)}, ${(bboxH/2).toFixed(1)})`);

// Crop to the exact bbox so any asymmetric transparent margin doesn't
// bias placement.
const cropped = src.clone().crop({ x: minX, y: minY, w: bboxW, h: bboxH });

// Scale the bbox to fit inside CANVAS_SIZE * TARGET_FILL on the longer axis.
const targetSide = Math.round(CANVAS_SIZE * TARGET_FILL);
const scale = targetSide / bboxSide;
const scaledW = Math.round(bboxW * scale);
const scaledH = Math.round(bboxH * scale);
cropped.resize({ w: scaledW, h: scaledH });

// Place the bbox so the (scaled) centroid lands on the icon's
// geometric center — optical centering rather than bbox centering.
const canvas = new Jimp({ width: CANVAS_SIZE, height: CANVAS_SIZE, color: BG_HEX });
const px = Math.round(CANVAS_SIZE / 2 - centroidInBboxX * scale);
const py = Math.round(CANVAS_SIZE / 2 - centroidInBboxY * scale);
canvas.composite(cropped, px, py);

await canvas.write(OUT);
console.log(`Wrote ${OUT} (${CANVAS_SIZE}x${CANVAS_SIZE}, logo placed at ${px},${py} sized ${scaledW}x${scaledH})`);
