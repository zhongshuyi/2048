// build-prod.mjs — Build frontend to backend/static/ for production
import obfuscator from "javascript-obfuscator";
const { obfuscate } = obfuscator;
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const FRONTEND = resolve(ROOT, "..", "frontend");
const STATIC = resolve(ROOT, "..", "backend", "static");
const JS_DIR = resolve(FRONTEND, "js");

// Clean static
if (existsSync(STATIC)) rmSync(STATIC, { recursive: true });
mkdirSync(STATIC, { recursive: true });

// Copy non-JS assets
cpSync(resolve(FRONTEND, "index.html"), resolve(STATIC, "index.html"));
cpSync(resolve(FRONTEND, "assets"), resolve(STATIC, "assets"), { recursive: true });
cpSync(resolve(FRONTEND, "vendor"), resolve(STATIC, "vendor"), { recursive: true });

// Obfuscate and copy JS files
mkdirSync(resolve(STATIC, "js"), { recursive: true });
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
  renameGlobals: false,
  selfDefending: true,
  disableConsoleOutput: true,
  debugProtection: true,
};

for (const file of jsFiles) {
  const srcPath = resolve(JS_DIR, file);
  const destPath = resolve(STATIC, "js", file);
  if (!existsSync(srcPath)) { console.warn(`Skipping: ${file}`); continue; }
  const code = readFileSync(srcPath, "utf-8");
  const result = obfuscate(code, obfOptions);
  writeFileSync(destPath, result.getObfuscatedCode(), "utf-8");
  console.log(`Obfuscated: ${file} (${code.length} -> ${result.getObfuscatedCode().length}B)`);
}

console.log(`\nProduction build: ${STATIC}`);
console.log("Update config.toml: static_dir = \"static\"");
console.log("Then: cd backend && python server.py");
