/*
 * One-off: redraw the wheel inside public/img/Logo/choice-champ-title.png
 * with the new 5-slice palette, leaving the surrounding "CHOICE" and
 * "CHAMP" text alone.
 *
 * The wheel sits at center (1446, 188) in the source image with an
 * outer radius of ~188px including the black rim. We clear that
 * circle to transparent and re-paint the wheel using the same
 * geometry rules as scripts/generate-logo.mjs.
 */
import { Jimp } from 'jimp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATH = join(__dirname, '..', 'public', 'img', 'Logo', 'choice-champ-title.png');

const img = await Jimp.read(PATH);

// Wheel center + radius detected from the source image. Adjust if the
// title image dimensions ever change.
const cx = 1446;
const cy = 188;
const R_OUTER = 178;

// Geometry — proportional to R_OUTER so it scales with the wheel.
// Tuned to match the visual weight of scripts/generate-logo.mjs at
// this smaller wheel size (the standalone logo has R_OUTER=460).
const RING_WIDTH  = Math.round(R_OUTER * 0.048); // ~9px
const DIVIDER_W   = Math.round(R_OUTER * 0.020); // ~4px
const R_HUB       = Math.round(R_OUTER * 0.196); // ~35px
const HUB_BORDER  = Math.round(R_OUTER * 0.013); // ~2px

const POINTER_ANGLE_DEG = 8;                                      // clockwise tilt
const POINTER_LENGTH    = R_OUTER + Math.round(R_OUTER * 0.065);  // hub → tip
const POINTER_TIP_R     = Math.max(3, Math.round(R_OUTER * 0.060)); // rounded tip
const POINTER_PIVOT_R   = Math.round(R_OUTER * 0.20);
const POINTER_OUTLINE   = Math.max(2, Math.round(R_OUTER * 0.020));

const COLOR = {
    tv:    0xF04C53FF,
    board: 0x45B859FF,
    game:  0x2482C5FF,
    book:  0xA855F7FF,
    movie: 0xFCB016FF,
};
const SLICE_ORDER = ['tv', 'board', 'game', 'book', 'movie'];
const BLACK = 0x000000FF;
const WHITE = 0xFFFFFFFF;
const TRANSPARENT = 0x00000000;
const SLICE_RAD = (2 * Math.PI) / 5;

const W = img.bitmap.width;
const H = img.bitmap.height;

// First pass: clear the old wheel (anything within R_OUTER + small
// margin of the wheel center, including the pointer tip area above).
const clearMargin = Math.round(R_OUTER * 0.1);
img.scan(0, 0, W, H, function (x, y) {
    const dx = x - cx;
    const dy = y - cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r <= R_OUTER + clearMargin) {
        this.setPixelColor(TRANSPARENT, x, y);
    }
});

// Second pass: draw the new wheel body.
img.scan(0, 0, W, H, function (x, y) {
    const dx = x - cx;
    const dy = y - cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r > R_OUTER) return;

    if (r > R_OUTER - RING_WIDTH) {
        this.setPixelColor(BLACK, x, y);
        return;
    }
    if (r <= R_HUB) {
        if (r > R_HUB - HUB_BORDER) {
            this.setPixelColor(BLACK, x, y);
        } else {
            this.setPixelColor(WHITE, x, y);
        }
        return;
    }
    let theta = Math.atan2(dy, dx) + Math.PI / 2;
    if (theta < 0) theta += 2 * Math.PI;
    if (theta >= 2 * Math.PI) theta -= 2 * Math.PI;
    const inSlice = theta % SLICE_RAD;
    const distFromBoundary = Math.min(inSlice, SLICE_RAD - inSlice);
    if (distFromBoundary * r < DIVIDER_W / 2) {
        this.setPixelColor(BLACK, x, y);
        return;
    }
    const sliceIdx = Math.floor(theta / SLICE_RAD);
    this.setPixelColor(COLOR[SLICE_ORDER[sliceIdx]], x, y);
});

// Pointer — tapered band between two circles (rounded tip + bulbous
// pivot), tilted clockwise. Same geometry as scripts/generate-logo.mjs.
const angleRad = (POINTER_ANGLE_DEG * Math.PI) / 180;
const AXIS_DX = Math.sin(angleRad);
const AXIS_DY = -Math.cos(angleRad);
const tipCx = cx + POINTER_LENGTH * AXIS_DX;
const tipCy = cy + POINTER_LENGTH * AXIS_DY;

function paintPointer(color, sizeBoost) {
    const tipR = POINTER_TIP_R + sizeBoost;
    const pivotR = POINTER_PIVOT_R + sizeBoost;
    const slack = pivotR + 2;
    const minX = Math.floor(Math.min(cx, tipCx) - slack);
    const maxX = Math.ceil(Math.max(cx, tipCx) + slack);
    const minY = Math.floor(Math.min(cy, tipCy) - slack);
    const maxY = Math.ceil(Math.max(cy, tipCy) + slack);
    for (let y = minY; y <= maxY; y++) {
        if (y < 0 || y >= H) continue;
        for (let x = minX; x <= maxX; x++) {
            if (x < 0 || x >= W) continue;
            const dx = x - cx, dy = y - cy;
            const along = dx * AXIS_DX + dy * AXIS_DY;
            const perpX = dx - along * AXIS_DX;
            const perpY = dy - along * AXIS_DY;
            const perpDist = Math.sqrt(perpX * perpX + perpY * perpY);
            const distToTip = Math.sqrt((x - tipCx) ** 2 + (y - tipCy) ** 2);
            if (distToTip <= tipR) { img.setPixelColor(color, x, y); continue; }
            const distToPivot = Math.sqrt(dx * dx + dy * dy);
            if (distToPivot <= pivotR) { img.setPixelColor(color, x, y); continue; }
            if (along < 0 || along > POINTER_LENGTH) continue;
            const t = along / POINTER_LENGTH;
            const widthHere = pivotR + (tipR - pivotR) * t;
            if (perpDist <= widthHere) img.setPixelColor(color, x, y);
        }
    }
}

paintPointer(BLACK, POINTER_OUTLINE);
paintPointer(WHITE, 0);

await img.write(PATH);
console.log(`updated ${PATH}`);
