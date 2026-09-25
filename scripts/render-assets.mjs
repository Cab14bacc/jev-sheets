// Renders the listing images from the hand-drawn artwork in assets/:
//   logo-source.png   -> assets/icon-{32,48,96,128}.png and docs/icon.png
//   banner-source.png -> assets/banner-220x140.png
// Each is cropped to its drawn content (measured below) and centered on white.
// Run: npm run assets
import { Resvg } from "@resvg/resvg-js";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

// Bounding boxes of the drawn content, measured on the source files.
// Re-measure if the artwork is redrawn with different margins.
const LOGO = { file: "assets/logo-source.png", x0: 19, y0: 26, x1: 98, y1: 117 };
const BANNER = { file: "assets/banner-source.png", x0: 23, y0: 17, x1: 270, y1: 138 };

/** The image cropped to its content box, centered in a `w`x`h` canvas with `pad` around it. */
function canvas(art, w, h, pad, background) {
  const png = readFileSync(art.file);
  const srcW = png.readUInt32BE(16);
  const srcH = png.readUInt32BE(20);
  const bw = art.x1 - art.x0 + 1;
  const bh = art.y1 - art.y0 + 1;
  const scale = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh);
  const dw = bw * scale;
  const dh = bh * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${background}"/>
  <svg x="${dx}" y="${dy}" width="${dw}" height="${dh}" viewBox="${art.x0} ${art.y0} ${bw} ${bh}">
    <clipPath id="c"><rect x="${art.x0}" y="${art.y0}" width="${bw}" height="${bh}"/></clipPath>
    <image href="data:image/png;base64,${png.toString("base64")}" x="0" y="0" width="${srcW}" height="${srcH}" clip-path="url(#c)"/>
  </svg>
</svg>`;
}

const render = (svg, width) => new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();

mkdirSync("assets", { recursive: true });

const iconSvg = canvas(LOGO, 128, 128, 10, "#ffffff");
for (const size of [32, 48, 96, 128]) writeFileSync(`assets/icon-${size}.png`, render(iconSvg, size));
copyFileSync("assets/icon-128.png", "docs/icon.png");

writeFileSync("assets/banner-220x140.png", render(canvas(BANNER, 220, 140, 12, "#ffffff"), 220));

console.log("Wrote assets/icon-32/48/96/128.png, assets/banner-220x140.png, docs/icon.png");
