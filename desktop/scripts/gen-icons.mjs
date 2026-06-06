// gen-icons.mjs — Convert assets/favicon.svg to Tauri PNG icons
import sharp from "sharp";
import toIco from "to-ico";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const SVG = readFileSync(resolve(ROOT, "..", "frontend", "assets", "favicon.svg"));
const ICONS = resolve(ROOT, "src-tauri", "icons");
mkdirSync(ICONS, { recursive: true });

const sizes = {
  "32x32.png": 32,
  "128x128.png": 128,
  "128x128@2x.png": 256,
  "Square30x30Logo.png": 30,
  "Square44x44Logo.png": 44,
  "Square71x71Logo.png": 71,
  "Square89x89Logo.png": 89,
  "Square107x107Logo.png": 107,
  "Square142x142Logo.png": 142,
  "Square150x150Logo.png": 150,
  "Square284x284Logo.png": 284,
  "Square310x310Logo.png": 310,
  "StoreLogo.png": 50,
};

for (const [name, size] of Object.entries(sizes)) {
  await sharp(SVG).resize(size, size).png().toFile(resolve(ICONS, name));
  console.log(`Generated: ${name} (${size}x${size})`);
}

// Generate ICO (32x32 + 16x16, proper format)
var buf32 = await sharp(SVG).resize(32, 32).png().toBuffer();
var buf16 = await sharp(SVG).resize(16, 16).png().toBuffer();
var ico = await toIco([buf32, buf16]);
writeFileSync(resolve(ICONS, "icon.ico"), ico);
console.log("Generated: icon.ico (32+16)");

// Copy SVG as icon.png for Linux
await sharp(SVG).resize(512, 512).png().toFile(resolve(ICONS, "icon.png"));
console.log("Generated: icon.png (512x512)");

// ICNS placeholder for macOS (copy 256px PNG)
await sharp(SVG).resize(256, 256).png().toFile(resolve(ICONS, "icon.icns"));
console.log("Generated: icon.icns");

console.log("All icons generated from favicon.svg");
