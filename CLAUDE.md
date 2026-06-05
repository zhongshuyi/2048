# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Run

```
python3 -m http.server 8080
# → open http://localhost:8080
```

`file://` protocol causes WebGL context lost warnings (browser sandbox). HTTP server required for clean runtime.

## Architecture

```
index.html          Entry point. Google Fonts (Rubik) + CSS + 5 JS files.
js/game-engine.js   Pure logic. Immutable state. createGame(size) → {state, events}. move(state, dir) → {state, moved, scoreGained, gameOver, events}.
js/ui-renderer.js   PixiJS v7.4.2 legacy. Canvas rendering, cubic-bezier animations, score counting. ~430 lines.
js/app.js           Orchestrator. Wires engine → renderer → input. Handles animation lock + pendingDirection queue.
js/input.js         Keyboard (Arrow keys), touch swipe, mouse drag. Threshold 14px.
js/storage.js       localStorage key "solo-2048-best" for best score.
assets/main.css     Page layout, CSS variables for animation timings, board shadow.
vendor/pixi.min.js  PixiJS v7.4.2 legacy. sourceMappingURL comment removed to silence console warning.
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
