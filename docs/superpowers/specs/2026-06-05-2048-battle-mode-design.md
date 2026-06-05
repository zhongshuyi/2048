# 2048 Battle Mode — Design Spec

**Date:** 2026-06-05
**Status:** Approved

## Overview

Add anonymous multiplayer battle mode to the existing 2048 game. Two players compete in real-time: either a timed match (highest score wins) or a race (first to 2048 wins). Python backend (FastAPI + WebSocket), no accounts, no persistence.

## Game Modes

### Timed Mode
- Creator/player selects time limit: 1 min, 3 min, or 5 min
- Both players play simultaneously on independent boards
- Timer counts down from the selected duration
- When timer hits 0, highest score wins. Tie → draw.
- Timer pulses red when < 30s remaining

### Race Mode
- Both players start simultaneously
- First to merge a 2048 tile wins immediately
- No time limit
- Elapsed time displayed (counting up)

## Matchmaking

### Create Room
- Player picks mode, time (if timed), grid size → clicks "Create Room"
- Server generates a 6-char room code (e.g., "AX7K2M")
- Room creator gets a shareable link
- Opponent opens link (or enters code) → joins → game starts for both

### Quick Match
- Player picks mode, time (if timed), grid size → clicks "Match"
- Server places player in a matchmaking queue
- When two compatible players are queued, they are paired → game starts
- Queue key: mode + time + gridSize
- No ELO/rating — purely random within same queue

### Room Lifecycle
- Room created → "waiting" state → opponent joins → "playing" state
- Either player disconnects → other player wins by forfeit
- Game ends → room destroyed after 30s grace period (for rematch)
- "Rematch" button: creates new game with same opponent, same settings

## UI Layout

### Main Menu (Lobby)
Three tabs:
- **Solo** — existing single-player game, plus nickname field
- **Create Room** — mode/time/grid selectors + create button + room code display
- **Quick Match** — mode/time/grid selectors + match button + "Searching..." state

Nickname field at top of menu, persisted to `localStorage` key `"solo-2048-nickname"`. Default: random name like `Player_<random>`.

### In-Game Battle Layout

```
┌───────────────────────────────────────┐
│   [YOU · 2048]  [1:42]  [OPP · 1536] │  ← header, centered above board
│                                       │
│            ┌──────────┐               │
│            │          │        ┌───┐  │
│            │  BOARD   │        │对 │  │  ← opponent mini-board:
│            │  (280px) │        │手 │  │    absolute, left:100%+10px
│            │          │        │   │  │    bottom:0, opacity 0.5
│            └──────────┘        └───┘  │    does NOT affect board centering
│                                       │
└───────────────────────────────────────┘
```

- **Header**: three-column — YOU (name + score) | timer | OPPONENT (name + score). Centered above own board.
- **Own board**: centered, full size, full opacity
- **Opponent mini-board**: `position: absolute`, right of own board, bottom-aligned. ~52px, 50% opacity. Label "对手" above it. No score repeated (score is in header).
- **Game over overlay**: "YOU WIN!" / "YOU LOSE!" / "DRAW!", final scores, rematch + back-to-menu buttons

### Responsive Behavior
- Board sizes down via existing `measure()` logic
- Opponent mini-board scales proportionally
- Header font sizes reduce on narrow screens

## Architecture

### Frontend (additions to existing)

```
js/battle-client.js   ← NEW: WebSocket client, match state, orchestrator
js/storage.js         ← EXTEND: add nickname get/set
index.html            ← EXTEND: lobby tab markup, battle UI elements
assets/main.css       ← EXTEND: lobby styles, battle header styles
```

`battle-client.js` responsibilities:
- Connect to WebSocket at `ws://<host>/ws/play`
- Send: `{type: "create_room"|"join_match"|"move"|"rematch", ...}`
- Receive: `{type: "waiting"|"start"|"opponent_move"|"game_over"|"opponent_disconnected", ...}`
- Own board uses existing `Engine2048.move()` for instant local feedback
- Server state is authoritative — local state reconciled on opponent updates
- Timer management (countdown/countup display)

### Backend (new)

```
server.py              ← FastAPI app, HTTP + WebSocket endpoints
game/engine.py         ← Python port of Engine2048 (move validation)
game/room_manager.py   ← Room/Match state, matchmaking queues
```

#### HTTP Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/rooms` | Create room. Body: `{mode, time?, gridSize}`. Returns: `{room_code}` |
| GET | `/api/rooms/{code}` | Get room info (exists, mode, waiting/playing) |

#### WebSocket Endpoint
| Path | Description |
|------|-------------|
| `/ws/play` | Main game socket. Messages below. |

#### WebSocket Protocol

**Client → Server:**
```json
{"type": "create_room", "mode": "timed", "time": 180, "gridSize": 4, "nickname": "Player_42"}
{"type": "join_room", "code": "AX7K2M", "nickname": "CatLover"}
{"type": "join_match", "mode": "race", "gridSize": 5, "nickname": "Player_42"}
{"type": "move", "direction": "left", "state": {...}}  // client state for validation
{"type": "rematch"}
{"type": "cancel"}  // cancel waiting/queue
```

**Server → Client:**
```json
{"type": "waiting", "room_code": "AX7K2M"}
{"type": "start", "game_id": "...", "your_board": {...}, "opponent_nickname": "CatLover", "mode": "timed", "time": 180, "gridSize": 4}
{"type": "opponent_move", "grid": [...], "score": 1536, "events": {...}}
{"type": "game_over", "winner": "you"|"opponent"|"draw", "reason": "time"|"2048"|"forfeit"|"dead", "your_score": 2048, "opponent_score": 1536}
{"type": "opponent_disconnected"}
{"type": "error", "message": "Room not found"}
```

#### Server-Side Validation
- `game/engine.py` is a Python translation of `js/game-engine.js` logic
- Server maintains authoritative game state for both players
- On `move`: server runs `Engine.move(serverState, direction)`, validates the result matches client's claimed new state
- If validation fails → server sends `error` and disconnects
- This prevents cheating (e.g., client claiming arbitrary scores)

#### State Management (room_manager.py)
- `rooms: dict[str, Room]` — active rooms by code
- `match_queues: dict[str, list[WSConnection]]` — waiting players by `{mode}:{time}:{gridSize}` key
- `games: dict[str, Game]` — active games by game_id
- All in-memory. Server restart clears everything.
- Cleanup on disconnect: remove from queue, forfeit active game, destroy room

## Data Flow (Typical Game)

1. **Player A** opens lobby → sets nickname (saved to localStorage) → selects mode/time/grid → clicks "Create Room"
2. **Client A** sends `create_room` via WebSocket → server creates Room → replies `waiting` with room code
3. **Player B** enters room code → client B sends `join_room` → server pairs them
4. **Server** sends `start` to both clients with their respective board states + opponent nickname
5. **Both play**: each `move` → client renders locally → sends to server → server validates → broadcasts `opponent_move` to other player
6. **Game ends** (time expires / 2048 reached / board dead) → server sends `game_over` to both
7. **Overlay shows** result → "Rematch" or "Back to Menu"

## Files Changed/Created

### Modified
- `index.html` — add lobby tabs, battle UI elements (header, opponent mini-board, overlay)
- `assets/main.css` — lobby styles, battle layout styles
- `js/storage.js` — add `getNickname()`, `setNickname()`
- `js/app.js` — add battle mode routing, lobby initialization

### New
- `js/battle-client.js` — WebSocket client, match flow, timer
- `server.py` — FastAPI entry point
- `game/__init__.py`
- `game/engine.py` — Python port of game logic
- `game/room_manager.py` — room/match state
- `requirements.txt` — fastapi, uvicorn

## Out of Scope
- Spectator mode
- Tournament brackets
- ELO/rating system
- Match history/replay
- Chat during game
- Mobile app (web responsive only)
- Bot/AI opponents
- Persistence (DB, Redis)
- Authentication/accounts

## Dependencies
- **Frontend**: no new dependencies (PixiJS v7.4.2 already present)
- **Backend**: `fastapi`, `uvicorn` (standard ASGI server)
