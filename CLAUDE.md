# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Run

```
# Unified server (frontend + backend, single port)
cd backend && python server.py
# → http://localhost:8081 (frontend + WebSocket)

# Desktop (Tauri build)
cd desktop && npx tauri build
```

`file://` protocol causes WebGL context lost warnings (browser sandbox). HTTP server required for clean runtime.

## Architecture

```
frontend/index.html          Entry point. Google Fonts (Rubik) + CSS + 5 JS files.
frontend/js/game-engine.js   Pure logic. Immutable state.
frontend/js/ui-renderer.js   PixiJS v7.4.2 legacy. Canvas rendering, spring physics animations.
frontend/js/app.js           Orchestrator. Wires engine → renderer → input.
frontend/js/input.js         Keyboard (Arrow/WASD), touch swipe, mouse drag.
frontend/js/storage.js       localStorage for best score, nickname, server URL.
frontend/assets/main.css     Page layout, CSS variables, responsive breakpoints.
frontend/vendor/pixi.min.js  PixiJS v7.4.2 legacy.
backend/server.py            FastAPI + WebSocket battle server.
backend/game/engine.py       Python port of game engine logic.
backend/game/room_manager.py In-memory room/matchmaking state.
desktop/src-tauri/           Tauri v2 project (Rust + WebView2).
desktop/scripts/             Build tooling (obfuscation, icon gen).
```

## Key details

**Animation system** (`ui-renderer.js`):
- Custom cubic-bezier LUT (128 samples, nearest-neighbour) matching CSS `ease-out` and `ease` curves exactly
- Timings: move 80ms (ease-out), merge pop 120ms (ease), appear 120ms (ease)
- CSS variables `--move-ms` / `--pop-ms` / `--appear-ms` override defaults
- `tween(duration, update, easingFn)` — ticker-based, returns Promise
- `tweenMoveTo` passes raw progress to callback; easing applied by tween itself

**Merge animation flow**:
1. Tiles slide (80ms ease-out)
2. `afterMoves`: consumed tile destroyed, survivor redrawn with new color
3. `tweenMergeReveal`: container pulse 1→1.15→1 + text scale 0→1 (120ms ease)

**Tile rendering** (`redrawTile`):
- Single solid fill + 1.5px white rim light at 12% opacity → Apple-like subtle depth
- No gradient bands (removed horizontal-line artifact)

**State immutability**: `Engine2048.move()` copies state before mutating. Returns `{state, moved, scoreGained, reached2048, gameOver, events}`. Events: `{moves: [{id,from,to}], merges: [{intoId,fromIds,to,newValue}], spawns: [{id,at,value}], removes: [{id}]}`.

**Input lock**: `app.locked = true` during animation. Next keypress stored in `pendingDirection` (one-deep queue). Callback unlocks and drains queue.

**`vendor/pixi.min.js`**: PixiJS v7.4.2 **legacy** build (includes Canvas2D fallback). The sourceMappingURL at EOF was removed. If replacing, strip the last `//# sourceMappingURL=...` line.
