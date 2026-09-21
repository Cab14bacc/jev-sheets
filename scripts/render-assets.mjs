// Renders the listing images from the hand-drawn logo (assets/logo-source.png):
// - assets/icon-{32,48,96,128}.png: the geometric mark only, squared
// - assets/banner-220x140.png: the mark plus the "JEV" lettering
// - docs/icon.png: website favicon/header icon
// The logo's "for Google Sheet" line is left out on purpose: Google's
// Marketplace rules don't allow Google trademarks in app graphics.
// Run: npm run assets
import { Resvg } from "@resvg/resvg-js";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const SOURCE = "assets/logo-source.png";
const source = readFileSync(SOURCE);
// PNG header: width and height are big-endian uint32s at bytes 16 and 20.
const SRC_W = source.readUInt32BE(16);
const SRC_H = source.readUInt32BE(20);
// Bounding boxes measured on the source image (re-measure if the logo's layout changes).
const MARK = { x0: 8, y0: 6, x1: 107, y1: 148 }; // geometric mark + colored badge
const WORD = { x0: 108, y0: 17, x1: 243, y1: 54 }; // "JEV"

const png = `data:image/png;base64,${source.toString("base64")}`;
let clipId = 0;

/**
 * A crop of the source as a nested <svg>, placed at (x, y) with the given size.
 * The image is clipped to the box: when the box's aspect ratio differs from the
 * target's, the viewport would otherwise show neighboring parts of the logo.
 */
function crop(box, pad, x, y, w, h) {
  const bx = box.x0 - pad;
  const by = box.y0 - pad;
  const bw = box.x1 - box.x0 + 1 + 2 * pad;
  const bh = box.y1 - box.y0 + 1 + 2 * pad;
  const id = `c${clipId++}`;
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${bx} ${by} ${bw} ${bh}" preserveAspectRatio="xMidYMid meet">
    <clipPath id="${id}"><rect x="${box.x0}" y="${box.y0}" width="${box.x1 - box.x0 + 1}" height="${box.y1 - box.y0 + 1}"/></clipPath>
    <image href="${png}" x="0" y="0" width="${SRC_W}" height="${SRC_H}" clip-path="url(#${id})"/>
  </svg>`;
}

function render(svg, width) {
  return new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
}

mkdirSync("assets", { recursive: true });

// Icon: square canvas, white background, mark centered with a little margin.
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" fill="#ffffff"/>
  ${crop(MARK, 6, 0, 0, 128, 128)}
</svg>`;
for (const size of [32, 48, 96, 128]) writeFileSync(`assets/icon-${size}.png`, render(iconSvg, size));
copyFileSync("assets/icon-128.png", "docs/icon.png");

// Banner: mark on the left, "JEV" to its right.
const bannerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="140" viewBox="0 0 220 140">
  <rect width="220" height="140" fill="#ffffff"/>
  ${crop(MARK, 4, 22, 15, 78, 110)}
  ${crop(WORD, 2, 108, 45, 96, 30)}
</svg>`;
writeFileSync("assets/banner-220x140.png", render(bannerSvg, 220));

console.log("Wrote assets/icon-32/48/96/128.png, assets/banner-220x140.png, docs/icon.png");
