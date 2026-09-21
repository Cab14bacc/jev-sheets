// Renders Marketplace listing images from docs/icon.svg into assets/:
// icons at 32/48/96/128 px and the 220x140 card banner.
// Run: npm run assets
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

mkdirSync("assets", { recursive: true });
const icon = readFileSync("docs/icon.svg", "utf8");

for (const size of [32, 48, 96, 128]) {
  const png = new Resvg(icon, { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(`assets/icon-${size}.png`, png);
}

// Banner: icon on the left, name on the right. Inner icon markup is reused as-is.
const inner = icon.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const banner = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="140" viewBox="0 0 220 140">
  <rect width="220" height="140" fill="#f4f1ff"/>
  <g transform="translate(18 38) scale(0.5)">${inner}</g>
  <text x="92" y="68" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="22" font-weight="700" fill="#1f2328">Jev</text>
  <text x="92" y="90" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="14" fill="#59636e">for Sheets</text>
</svg>`;
writeFileSync(
  "assets/banner-220x140.png",
  new Resvg(banner, { font: { loadSystemFonts: true } }).render().asPng(),
);

console.log("Wrote assets/: icon-32/48/96/128.png, banner-220x140.png");
