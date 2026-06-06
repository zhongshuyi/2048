import sharp from "sharp";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const W = 1280, H = 640;

const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#16213e"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="60" y="60" width="${W-120}" height="${H-120}" rx="24" fill="none" stroke="#e0c28c" stroke-width="2" opacity="0.3"/>
  <text x="640" y="220" text-anchor="middle" font-family="Arial,sans-serif" font-size="96" font-weight="bold" fill="#f9f6f2">2048</text>
  <text x="640" y="320" text-anchor="middle" font-family="Arial,sans-serif" font-size="32" fill="#e0c28c">经典数字游戏 × 实时双人对战</text>
  <text x="640" y="440" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" fill="#8a8a8a">Single-player + PvP Battle | FastAPI + PixiJS + Tauri</text>
  <text x="640" y="520" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" fill="#6a6a6a">github.com/zhongshuyi/2048</text>
</svg>`;

const outPath = resolve(__dirname, "../../opengraph.png");
const buf = await sharp(Buffer.from(svg)).png().toBuffer();
writeFileSync(outPath, buf);
console.log("Created:", outPath);
