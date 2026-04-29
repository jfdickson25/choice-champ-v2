/*
 * Generate the Choice Champ wheel logo from scratch — five equal
 * 72° slices in the media-type colors, black outer ring, black slice
 * dividers, white hub, and a white pointer. Written so it produces a
 * pixel-perfect square PNG centered on the canvas, replacing the
 * old hand-drawn 4-color logo.
 *
 * Output: public/logo.png (1024×1024, transparent background, wheel
 * centered with a small margin to leave room for the pointer to
 * extend past the outer ring).
 *
 * After running, also rerun:
 *   node scripts/center-icon.mjs
 *   node scripts/generate-splash-images.mjs
 *
 * Slice color order (clockwise from 12 o'clock) preserves the old
 * logo's overall palette feel — yellow top-left, red top-right, with
 * purple inserted on the lower-left in the new fifth slot:
 *   1) TV       red    (#F04C53)
 *   2) Board    green  (#45B859)
 *   3) Game     blue   (#2482C5)
 *   4) Book     purple (#A855F7)   ← new
 *   5) Movie    yellow (#FCB016)
 */
import { Jimp } from 'jimp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'logo.png');

const SIZE = 1024;
const cx = SIZE / 2;
const cy = SIZE / 2;

// Wheel geometry (tuned for the 1024×1024 canvas). The outer-ring
// inset leaves room for the pointer to extend past 12 o'clock.
const R_OUTER     = 460;
const RING_WIDTH  = 22;
const DIVIDER_W   = 9;
const R_HUB       = 90;
const HUB_BORDER  = 6;

// Pointer (white teardrop, slightly tilted clockwise, anchored at
// the hub). The original logo's pointer was chunky and cartoony —
// these proportions match its visual weight, with a rounded tip
// (not a sharp point) and a small lean toward the red slice so the
// wheel reads as "spinning toward a winner" rather than dead-center.
const POINTER_ANGLE_DEG = 8;                  // clockwise tilt from vertical
const POINTER_LENGTH    = R_OUTER + 30;       // hub center → tip distance
const POINTER_TIP_R     = 18;                 // radius of rounded tip
const POINTER_PIVOT_R   = 60;                 // radius of bulbous base
const POINTER_OUTLINE   = 7;                  // black outline thickness

// 32-bit RGBA hex (Jimp). Match src/shared/lib/mediaTypes.js exactly.
const COLOR = {
    tv:    0xF04C53FF,
    board: 0x45B859FF,
    game:  0x2482C5FF,
    book:  0xA855F7FF,
    movie: 0xFCB016FF,
};
const SLICE_ORDER = ['tv', 'board', 'game', 'book', 'movie'];

const BLACK       = 0x000000FF;
const WHITE       = 0xFFFFFFFF;
const TRANSPARENT = 0x00000000;
const SLICE_RAD   = (2 * Math.PI) / 5;

const canvas = new Jimp({ width: SIZE, height: SIZE, color: TRANSPARENT });

// Single pixel-walk for the wheel body: outer ring, colored slices,
// dividers, and hub. atan2 returns -π..π with +x = 3 o'clock; rotate
// by +π/2 so 0 sits at 12 o'clock and angles increase clockwise.
canvas.scan(0, 0, SIZE, SIZE, function (x, y) {
    const dx = x - cx;
    const dy = y - cy;
    const r = Math.sqrt(dx * dx + dy * dy);

    if (r > R_OUTER) return; // outside wheel — leave transparent

    // Outer black ring.
    if (r > R_OUTER - RING_WIDTH) {
        this.setPixelColor(BLACK, x, y);
        return;
    }

    // Hub region.
    if (r <= R_HUB) {
        if (r > R_HUB - HUB_BORDER) {
            this.setPixelColor(BLACK, x, y);
        } else {
            this.setPixelColor(WHITE, x, y);
        }
        return;
    }

    // Colored slice region.
    let theta = Math.atan2(dy, dx) + Math.PI / 2;
    if (theta < 0) theta += 2 * Math.PI;
    if (theta >= 2 * Math.PI) theta -= 2 * Math.PI;

    // Black radial divider when within half a divider's arc length of
    // a slice boundary. Arc length = r * Δθ, so Δθ_max = halfW / r —
    // narrower at the rim, gracefully widening near the hub.
    const inSliceTheta = theta % SLICE_RAD;
    const distFromBoundary = Math.min(inSliceTheta, SLICE_RAD - inSliceTheta);
    if (distFromBoundary * r < DIVIDER_W / 2) {
        this.setPixelColor(BLACK, x, y);
        return;
    }

    const sliceIdx = Math.floor(theta / SLICE_RAD);
    this.setPixelColor(COLOR[SLICE_ORDER[sliceIdx]], x, y);
});

// Pointer geometry derived from the angle + length params: a tapered
// band between two circles (small at the tip, large at the pivot).
// The taper width interpolates linearly along the axis, and the two
// end circles round off both ends so the silhouette reads as a
// teardrop rather than a triangle.
const angleRad = (POINTER_ANGLE_DEG * Math.PI) / 180;
const POINTER_AXIS_DX = Math.sin(angleRad);   // unit vector along pointer
const POINTER_AXIS_DY = -Math.cos(angleRad);  // (negative because Y grows downward)
const tipCx = cx + POINTER_LENGTH * POINTER_AXIS_DX;
const tipCy = cy + POINTER_LENGTH * POINTER_AXIS_DY;

function paintPointer(color, sizeBoost) {
    const tipR = POINTER_TIP_R + sizeBoost;
    const pivotR = POINTER_PIVOT_R + sizeBoost;
    // Iterate the bounding box of the pointer (axis-aligned, with slack
    // for the tilt + outline). For each pixel, project onto the pointer
    // axis and decide if it's inside the tip circle, base circle, or
    // tapered band.
    const slack = pivotR + 2;
    const minX = Math.floor(Math.min(cx, tipCx) - slack);
    const maxX = Math.ceil(Math.max(cx, tipCx) + slack);
    const minY = Math.floor(Math.min(cy, tipCy) - slack);
    const maxY = Math.ceil(Math.max(cy, tipCy) + slack);
    for (let y = minY; y <= maxY; y++) {
        if (y < 0 || y >= SIZE) continue;
        for (let x = minX; x <= maxX; x++) {
            if (x < 0 || x >= SIZE) continue;
            // Project (x, y) onto the axis from pivot (cx,cy) to tip.
            const dx = x - cx, dy = y - cy;
            const along = dx * POINTER_AXIS_DX + dy * POINTER_AXIS_DY;     // 0 at pivot, POINTER_LENGTH at tip
            const perpX = dx - along * POINTER_AXIS_DX;
            const perpY = dy - along * POINTER_AXIS_DY;
            const perpDist = Math.sqrt(perpX * perpX + perpY * perpY);
            // Tip circle (round cap at the top).
            const distToTip = Math.sqrt((x - tipCx) ** 2 + (y - tipCy) ** 2);
            if (distToTip <= tipR) { canvas.setPixelColor(color, x, y); continue; }
            // Pivot circle (round bulb at the base).
            const distToPivot = Math.sqrt(dx * dx + dy * dy);
            if (distToPivot <= pivotR) { canvas.setPixelColor(color, x, y); continue; }
            // Tapered band — only the segment between pivot and tip.
            if (along < 0 || along > POINTER_LENGTH) continue;
            const t = along / POINTER_LENGTH;       // 0 at pivot → 1 at tip
            const widthHere = pivotR + (tipR - pivotR) * t;
            if (perpDist <= widthHere) canvas.setPixelColor(color, x, y);
        }
    }
}

paintPointer(BLACK, POINTER_OUTLINE);  // outline (slightly bigger)
paintPointer(WHITE, 0);                // white fill on top

await canvas.write(OUT);
console.log(`wrote ${OUT} (${SIZE}×${SIZE})`);
