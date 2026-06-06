# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Important**: Do NOT add `Co-Authored-By` trailer to commit messages. The author is the sole contributor.

## Run

```
# Install dependencies
cd backend && pip install -r requirements.txt

# Unified server (frontend + backend, single port)
cd backend && python server.py
# → http://localhost:8081 (frontend + WebSocket)

# Desktop (Tauri build)
cd desktop && npx tauri build
```

Requires Python ≥3.11 (`tomllib`). `file://` protocol causes WebGL context lost warnings (browser sandbox). HTTP server required for clean runtime.

## Architecture

```
frontend/index.html          Entry point. Google Fonts (Rubik) + CSS + 6 JS files.
frontend/js/game-engine.js   Pure logic. Immutable state.
frontend/js/ui-renderer.js   PixiJS v7.4.2 legacy. Canvas rendering, spring physics animations.
frontend/js/app.js           Orchestrator. Wires engine → renderer → input.
frontend/js/input.js         Keyboard (Arrow/WASD), touch swipe, mouse drag.
frontend/js/storage.js       localStorage for best score, nickname, server URL.
frontend/js/battle-client.js WebSocket client. Timer, opponent mini-board, message dispatch.
frontend/assets/main.css     Page layout, CSS variables, responsive breakpoints.
frontend/vendor/pixi.min.js  PixiJS v7.4.2 legacy.
backend/server.py            FastAPI + WebSocket battle server. SPA fallback for frontend.
backend/config.py            Loads config.toml, env var overrides for all settings.
backend/config.toml          Default config (host, port, redis, logging).
backend/config.prod.toml     Production overrides (higher limits).
backend/game/__init__.py     Package init.
backend/game/engine.py       Python port of game engine logic.
backend/game/room_manager.py In-memory room/matchmaking state.
backend/game/room_manager_redis.py Redis-backed RoomManager for multi-worker scaling.
desktop/src-tauri/           Tauri v2 project (Rust + WebView2).
desktop/scripts/             Build tooling (obfuscation, icon gen).
```

## Config system

`backend/config.py` loads `config.toml`, then overlays env vars. Same-name env var overrides any TOML key. See `config.py` for exact mappings.

Key settings:
- `server.max_games` (0 = unlimited) — reject new games above limit
- `server.cleanup_interval` — seconds between finished-game cleanup
- `redis.enabled` — switch between in-memory (`RoomManager`) and Redis (`RedisRoomManager`)

Production: set `CONFIG_PATH=config.prod.toml` or deploy with env vars.

## Battle mode protocol

Client-authoritative state model. Server trusts client state, never validates moves. Server role: room management, matchmaking, state forwarding.

WebSocket endpoint: `/ws/play`

**Client → Server messages:**
| type | purpose |
|---|---|
| `create_room` | Create room, get 6-char code |
| `join_room` | Join by room code |
| `join_match` | Enter matchmaking queue |
| `move` | Send post-move state (throttled 80ms) |
| `rematch` | Request rematch (both must agree) |
| `cancel` | Leave queue/room |

**Server → Client messages:**
| type | purpose |
|---|---|
| `waiting` | Queued or room created (may include `room_code`) |
| `start` | Game begins (both boards, opponent nickname, mode) |
| `opponent_move` | Opponent grid + score update (value grid, not tile IDs) |
| `opponent_dead` | Opponent board has no moves |
| `game_over` | Game ended (winner, reason, scores) |
| `error` | Server error with `message` |

**Game modes:** `timed` (1/3/5 min countdown, highest score wins) and `race` (first to 2048 wins).

**Matchmaking key:** `"{mode}:{time}:{gridSize}"` — players only match with identical config.

## Redis / multi-worker

Set `redis.enabled = true` in config to use `RedisRoomManager` instead of `RoomManager`. Redis stores rooms and games as hashes, queues as lists. Uses pub/sub (`2048:events` channel) for cross-worker notifications. WebSocket objects are local-only (registered per worker via `_ws_registry`).

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

**Note**: `server.py` cleanup interval now respects `config.CLEANUP_INTERVAL` (duplicate `_periodic_cleanup` definition removed).
