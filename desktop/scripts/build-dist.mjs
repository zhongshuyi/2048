// build-dist.mjs — Copy static files to dist/ and obfuscate JS
import obfuscator from "javascript-obfuscator";
const { obfuscate } = obfuscator;
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from "fs";
import { resolve, dirname, basename } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = resolve(ROOT, "dist");
const FRONTEND = resolve(ROOT, "..", "frontend");
const JS_DIR = resolve(FRONTEND, "js");

// Clean dist
if (existsSync(DIST)) rmSync(DIST, { recursive: true });
mkdirSync(DIST, { recursive: true });

// Copy non-JS assets
cpSync(resolve(FRONTEND, "index.html"), resolve(DIST, "index.html"));
cpSync(resolve(FRONTEND, "assets"), resolve(DIST, "assets"), { recursive: true });
cpSync(resolve(FRONTEND, "vendor"), resolve(DIST, "vendor"), { recursive: true });

// Obfuscate and copy JS files
mkdirSync(resolve(DIST, "js"), { recursive: true });
const jsFiles = ["storage.js", "game-engine.js", "ui-renderer.js", "input.js", "battle-client.js", "app.js"];

const obfOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  stringArray: true,
  stringArrayThreshold: 0.5,
  stringArrayEncoding: ["base64"],
  renameGlobals: false,  // keep window.* names intact
  selfDefending: true,
  disableConsoleOutput: true,
  debugProtection: true,
};

for (const file of jsFiles) {
  const srcPath = resolve(JS_DIR, file);
  const destPath = resolve(DIST, "js", file);

  if (!existsSync(srcPath)) {
    console.warn(`Skipping missing file: ${file}`);
    continue;
  }

  const code = readFileSync(srcPath, "utf-8");
  const result = obfuscate(code, obfOptions);
  writeFileSync(destPath, result.getObfuscatedCode(), "utf-8");
  console.log(`Obfuscated: ${file} (${code.length} → ${result.getObfuscatedCode().length} bytes)`);
}

console.log("Build complete: dist/");
