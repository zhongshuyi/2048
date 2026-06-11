// build-bundle.mjs — Bundle all frontend assets into single JS/CSS, output to backend/static/
import * as esbuild from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const FRONTEND = resolve(ROOT, "..", "frontend");
const STATIC = resolve(ROOT, "..", "backend", "static");

// --- Clean output dir ---
if (existsSync(STATIC)) rmSync(STATIC, { recursive: true });
mkdirSync(STATIC, { recursive: true });
mkdirSync(resolve(STATIC, "assets"), { recursive: true });

// --- Step 1: Create temp entry file that imports all JS in order ---
const jsOrder = [
  "storage.js",
  "game-engine.js",
  // pixi.min.js is bundled separately (external, not ES module)
  "ui-renderer.js",
  "input.js",
  "battle-client.js",
  "app.js",
];

// Build the app JS files as an IIFE bundle
const jsDir = resolve(FRONTEND, "js");
const entryContent = jsOrder
  .map((f) => `import "${resolve(jsDir, f).replace(/\\/g, "/")}";`)
  .join("\n");

const tmpEntry = resolve(ROOT, ".tmp-entry.mjs");
writeFileSync(tmpEntry, entryContent, "utf-8");

// --- Step 2: Bundle app JS with esbuild ---
try {
  const appResult = await esbuild.build({
    entryPoints: [tmpEntry],
    bundle: true,
    minify: true,
    format: "iife",
    target: "es2020",
    outfile: resolve(STATIC, "app.tmp.js"),
    write: true,
  });
  console.log("App JS bundled and minified.");
} finally {
  rmSync(tmpEntry);
}

// --- Step 3: Concatenate pixi.min.js + app bundle into single file ---
const pixi = readFileSync(resolve(FRONTEND, "vendor", "pixi.min.js"), "utf-8");
const appJs = readFileSync(resolve(STATIC, "app.tmp.js"), "utf-8");

// Inline script from index.html
const inlineScript = `
if (/github\\.io/.test(location.hostname)) {
  document.getElementById("demoBar").style.display = "block";
}
`;

const bundle = pixi + "\n" + appJs + "\n" + inlineScript;
writeFileSync(resolve(STATIC, "assets", "bundle.js"), bundle, "utf-8");
rmSync(resolve(STATIC, "app.tmp.js"));

const pixiSize = Buffer.byteLength(pixi, "utf-8");
const appSize = Buffer.byteLength(appJs, "utf-8");
const bundleSize = Buffer.byteLength(bundle, "utf-8");
console.log(`Bundle: pixi=${(pixiSize/1024).toFixed(1)}KB + app=${(appSize/1024).toFixed(1)}KB = ${(bundleSize/1024).toFixed(1)}KB`);

// --- Step 4: Minify CSS ---
const cssPath = resolve(FRONTEND, "assets", "main.css");
const cssResult = await esbuild.build({
  entryPoints: [cssPath],
  minify: true,
  outfile: resolve(STATIC, "assets", "style.css"),
  write: true,
});
const origCss = readFileSync(cssPath, "utf-8");
const minCss = readFileSync(resolve(STATIC, "assets", "style.css"), "utf-8");
console.log(`CSS: ${(Buffer.byteLength(origCss)/1024).toFixed(1)}KB -> ${(Buffer.byteLength(minCss)/1024).toFixed(1)}KB`);

// --- Step 5: Generate index.html ---
const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>2048</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;700;800;900&display=swap" rel="stylesheet" />
<link rel="icon" type="image/svg+xml" href="./assets/favicon.svg" />
<link rel="stylesheet" href="./assets/style.css" />
</head>
<body>
<div id="demoBar" style="display:none;background:#1a1a2e;color:#e0c28c;text-align:center;padding:6px 12px;font-size:13px;border-bottom:1px solid #e0c28c33;">
  Demo — 单人模式可玩，对战需 <a href="https://github.com/zhongshuyi/2048" style="color:#f9f6f2;font-weight:700;">本地部署</a>
</div>
<main class="page">
  <header class="header">
    <div class="title-area">
      <h1 class="title">2048</h1>
      <p class="subtitle">用方向键、滑动或拖拽移动方块，合成更大的数字。</p>
    </div>
    <div class="panel">
      <div class="scores" id="scoresPanel">
        <div class="score-card"><div class="score-label">分数</div><div class="score-value" id="scoreValue">0</div></div>
        <div class="score-card"><div class="score-label">最佳</div><div class="score-value" id="bestValue">0</div></div>
      </div>
      <div class="actions"><button class="btn" id="newGameBtn" type="button">新游戏</button></div>
    </div>
  </header>
  <div class="conn-bar" id="connBar">
    <span class="conn-dot" id="connDot"></span>
    <input class="conn-input" id="connInput" type="text" placeholder="服务器地址" />
    <button class="btn btn-primary conn-btn" id="connBtn" type="button">连接</button>
  </div>
  <nav class="lobby-tabs" id="lobbyTabs">
    <button class="lobby-tab active" data-tab="solo">单人</button>
    <button class="lobby-tab disabled" data-tab="room">创建房间</button>
    <button class="lobby-tab disabled" data-tab="match">快速匹配</button>
    <button class="lobby-tab disabled" data-tab="join">加入房间</button>
  </nav>
  <div class="nick-bar" id="nickBar" style="display:none">
    <label class="nick-label" for="nickInput">昵称</label>
    <input class="nick-input" id="nickInput" type="text" maxlength="14" placeholder="你的昵称" />
  </div>
  <div class="lobby-panel" id="panelSolo">
    <div class="grid-bar">
      <span class="grid-bar-label">网格</span>
      <div class="grid-seg">
        <input type="radio" id="gs4" name="gridSize" value="4" checked /><label class="grid-seg-label" for="gs4">4×4</label>
        <input type="radio" id="gs5" name="gridSize" value="5" /><label class="grid-seg-label" for="gs5">5×5</label>
        <input type="radio" id="gs6" name="gridSize" value="6" /><label class="grid-seg-label" for="gs6">6×6</label>
        <div class="grid-seg-pill" aria-hidden="true"></div>
      </div>
    </div>
  </div>
  <div class="lobby-panel hidden" id="panelRoom">
    <div class="battle-config">
      <div class="config-row"><span class="config-label">模式</span><div class="seg-row"><button class="seg-btn active" data-key="mode" data-val="timed">计时赛</button><button class="seg-btn" data-key="mode" data-val="race">竞速赛</button></div></div>
      <div class="config-row" id="rowTime"><span class="config-label">时间</span><div class="seg-row"><button class="seg-btn" data-key="time" data-val="60">1 分钟</button><button class="seg-btn active" data-key="time" data-val="180">3 分钟</button><button class="seg-btn" data-key="time" data-val="300">5 分钟</button></div></div>
      <div class="config-row"><span class="config-label">网格</span><div class="seg-row"><button class="seg-btn active" data-key="grid" data-val="4">4×4</button><button class="seg-btn" data-key="grid" data-val="5">5×5</button><button class="seg-btn" data-key="grid" data-val="6">6×6</button></div></div>
      <button class="btn btn-primary" id="createRoomBtn">创建房间</button>
    </div>
  </div>
  <div class="lobby-panel hidden" id="panelMatch">
    <div class="battle-config">
      <div class="config-row"><span class="config-label">模式</span><div class="seg-row"><button class="seg-btn active" data-key="mode" data-val="timed">计时赛</button><button class="seg-btn" data-key="mode" data-val="race">竞速赛</button></div></div>
      <div class="config-row" id="rowMatchTime"><span class="config-label">时间</span><div class="seg-row"><button class="seg-btn" data-key="time" data-val="60">1 分钟</button><button class="seg-btn active" data-key="time" data-val="180">3 分钟</button><button class="seg-btn" data-key="time" data-val="300">5 分钟</button></div></div>
      <div class="config-row"><span class="config-label">网格</span><div class="seg-row"><button class="seg-btn active" data-key="grid" data-val="4">4×4</button><button class="seg-btn" data-key="grid" data-val="5">5×5</button><button class="seg-btn" data-key="grid" data-val="6">6×6</button></div></div>
      <button class="btn btn-primary" id="matchBtn">开始匹配</button>
    </div>
  </div>
  <div class="lobby-panel hidden" id="panelJoin">
    <div class="battle-config">
      <div class="join-room-form">
        <input class="join-input-lg" id="joinInput" type="text" maxlength="6" placeholder="输入 6 位房间码" autocomplete="off" />
        <button class="btn btn-primary" id="joinRoomBtn">加入</button>
      </div>
    </div>
  </div>
  <div class="battle-header hidden" id="battleHeader">
    <div class="battle-score"><div class="battle-score-label">我方</div><div class="battle-score-name" id="myName">-</div><div class="battle-score-value" id="myScore">0</div></div>
    <div class="battle-timer" id="battleTimer">3:00</div>
    <div class="battle-score"><div class="battle-score-label">对手</div><div class="battle-score-name" id="oppName">-</div><div class="battle-score-value" id="oppScore">0</div></div>
  </div>
  <div class="waiting-panel hidden" id="panelWaiting">
    <div class="waiting-card">
      <div class="waiting-spinner" aria-hidden="true"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
      <div class="waiting-title" id="waitingTitle">等待对手加入...</div>
      <div class="waiting-code" id="waitingCode" hidden>房间码 <strong id="waitingCodeText"></strong></div>
      <div class="waiting-info" id="waitingInfo"></div>
      <button class="btn" id="cancelWaitBtn">取消</button>
    </div>
  </div>
  <section class="game-area">
    <div class="status" id="statusText" aria-live="polite"></div>
    <div class="board" id="board" aria-label="2048 棋盘" role="application">
      <div class="stage" id="stage" aria-hidden="true"></div>
      <div class="opp-mini hidden" id="oppBoardWrap"><div class="opp-mini-label">对手</div><div class="opp-mini-board" id="oppBoard"></div></div>
      <div class="overlay" id="overlay" hidden>
        <div class="overlay-card">
          <div class="overlay-title" id="overlayTitle">游戏结束!</div>
          <div class="overlay-scores" id="overlayScores" hidden></div>
          <div class="overlay-actions" id="overlayActions"><button class="btn btn-primary" id="tryAgainBtn" type="button">再来一局</button></div>
          <div class="overlay-actions hidden" id="overlayBattleActions"><button class="btn btn-primary" id="rematchBtn" type="button">再来一局</button><button class="btn" id="backToMenuBtn" type="button">返回菜单</button></div>
        </div>
      </div>
    </div>
  </section>
</main>
<script src="./assets/bundle.js"></script>
</body>
</html>`;

writeFileSync(resolve(STATIC, "index.html"), html, "utf-8");
console.log(`HTML: ${(Buffer.byteLength(html)/1024).toFixed(1)}KB`);

// --- Step 6: Copy favicon ---
cpSync(resolve(FRONTEND, "assets", "favicon.svg"), resolve(STATIC, "assets", "favicon.svg"));

// --- Summary ---
const files = ["index.html", "assets/bundle.js", "assets/style.css", "assets/favicon.svg"];
let total = 0;
console.log("\n=== Build output ===");
for (const f of files) {
  const p = resolve(STATIC, f);
  if (existsSync(p)) {
    const sz = readFileSync(p).length;
    total += sz;
    console.log(`  ${f} — ${(sz/1024).toFixed(1)}KB`);
  }
}
console.log(`  Total: ${(total/1024).toFixed(1)}KB`);
console.log(`\nReady: ${STATIC}`);
console.log("Run: cd backend && CONFIG_PATH=config.prod.toml python server.py");
