import { Jimp } from 'jimp';

const SRC = '/Users/danieldickson/GitHub/choice-champ-v2/public/logo.png';
const OUT = '/Users/danieldickson/GitHub/choice-champ-v2/public/img/icon.png';
const CANVAS_SIZE = 512;          // final icon dimensions
const TARGET_FILL = 0.78;         // logo occupies ~78% of canvas (so ~11% padding each side)
const BG_HEX = 0x312E2EFF;

const src = await Jimp.read(SRC);

// Find bbox of non-transparent pixels.
let minX = src.bitmap.width, minY = src.bitmap.height, maxX = -1, maxY = -1;
src.scan(0, 0, src.bitmap.width, src.bitmap.height, (x, y, idx) => {
    const a = src.bitmap.data[idx + 3];
    if (a > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
});

const bboxW = maxX - minX + 1;
const bboxH = maxY - minY + 1;
const bboxSide = Math.max(bboxW, bboxH);
console.log(`bbox: x=${minX}..${maxX} y=${minY}..${maxY} (${bboxW}x${bboxH}, max side ${bboxSide})`);

// Crop the source to the exact bbox so we discard any asymmetric
// transparent margin that was throwing off centering.
const cropped = src.clone().crop({ x: minX, y: minY, w: bboxW, h: bboxH });

// Scale the bbox to fit inside CANVAS_SIZE * TARGET_FILL on the longer axis.
const targetSide = Math.round(CANVAS_SIZE * TARGET_FILL);
const scale = targetSide / bboxSide;
const scaledW = Math.round(bboxW * scale);
const scaledH = Math.round(bboxH * scale);
cropped.resize({ w: scaledW, h: scaledH });

// Compose onto a #312E2E canvas, centered.
const canvas = new Jimp({ width: CANVAS_SIZE, height: CANVAS_SIZE, color: BG_HEX });
const px = Math.round((CANVAS_SIZE - scaledW) / 2);
const py = Math.round((CANVAS_SIZE - scaledH) / 2);
canvas.composite(cropped, px, py);

await canvas.write(OUT);
console.log(`Wrote ${OUT} (${CANVAS_SIZE}x${CANVAS_SIZE}, logo placed at ${px},${py} sized ${scaledW}x${scaledH})`);
