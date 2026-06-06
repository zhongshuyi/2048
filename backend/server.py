"""2048 Battle Mode — FastAPI server with WebSocket + static files."""
import json
import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import config

DIRECTIONS = frozenset(("left", "right", "up", "down"))

# Select backend: Redis for multi-worker, in-memory for single process
if config.REDIS_ENABLED:
    from game.room_manager_redis import RedisRoomManager
    manager = RedisRoomManager(config.REDIS_URL)
else:
    from game.room_manager import RoomManager
    manager = RoomManager()

ws_meta = {}

# ---- Lifespan (background tasks) ----

@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(_periodic_cleanup())
    yield
    task.cancel()

async def _periodic_cleanup():
    """Background task: clean up stale finished games every 5 minutes."""
    while True:
        await asyncio.sleep(config.CLEANUP_INTERVAL)
        if hasattr(manager, "cleanup_finished_games"):
            await manager.cleanup_finished_games()

app = FastAPI(title="2048 Battle Server", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/rooms")
async def create_room(body: dict):
    mode = body.get("mode", "timed")
    grid_size = body.get("gridSize", 4)
    if not isinstance(grid_size, int) or grid_size < 3 or grid_size > 8:
        return {"error": "Invalid gridSize"}, 400
    time_limit = body.get("time") if mode == "timed" else None
    if mode == "timed" and (not isinstance(time_limit, int) or time_limit <= 0):
        return {"error": "Invalid time"}, 400
    code = manager.create_room(mode, grid_size, time_limit)
    return {"room_code": code}


@app.get("/api/rooms/{code}")
async def get_room(code: str):
    room = manager.get_room(code)
    if not room:
        return {"error": "Room not found"}, 404
    return {
        "exists": True,
        "mode": room["mode"],
        "gridSize": room["gridSize"],
        "time": room.get("time"),
        "state": room["state"],
    }


@app.websocket("/ws/play")
async def websocket_play(ws: WebSocket):
    await ws.accept()
    ws_meta[ws] = {"nickname": "Anonymous", "in_game": False}

    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = data.get("type")
            if msg_type == "create_room":
                await handle_create_room(ws, data)
            elif msg_type == "join_room":
                await handle_join_room(ws, data)
            elif msg_type == "join_match":
                await handle_join_match(ws, data)
            elif msg_type == "move":
                await handle_move(ws, data)
            elif msg_type == "rematch":
                await handle_rematch(ws)
            elif msg_type == "cancel":
                await handle_cancel(ws)
            else:
                await ws.send_json({"type": "error", "message": f"Unknown type: {msg_type}"})

    except WebSocketDisconnect:
        pass
    finally:
        await handle_disconnect(ws)


# --- Message handlers ---

async def handle_create_room(ws, data):
    if config.MAX_GAMES and len(manager.games) >= config.MAX_GAMES:
        await ws.send_json({"type": "error", "message": "Server full, try again later"})
        return
    mode = data.get("mode", "timed")
    grid_size = data.get("gridSize", 4)
    time_limit = data.get("time") if mode == "timed" else None
    nickname = data.get("nickname", "Anonymous")
    ws_meta[ws]["nickname"] = nickname

    code = manager.create_room(mode, grid_size, time_limit)
    room = manager.get_room(code)
    room["creator_ws"] = ws
    ws_meta[ws]["room_code"] = code

    await ws.send_json({"type": "waiting", "room_code": code})


async def handle_join_room(ws, data):
    code = data.get("code", "").strip().upper()
    nickname = data.get("nickname", "Anonymous")
    ws_meta[ws]["nickname"] = nickname

    room = manager.join_room(code, ws)
    if not room:
        await ws.send_json({"type": "error", "message": "Room not found or already started"})
        return

    creator_ws = room["creator_ws"]
    ws_meta[ws]["in_game"] = True
    ws_meta[creator_ws]["in_game"] = True

    game = manager.create_game(
        room["mode"], room["gridSize"], room.get("time"),
        ws_meta[creator_ws]["nickname"], nickname,
        creator_ws, ws,
    )
    room["game_id"] = game["id"]

    # Send start to both players — check creator still connected
    ok = await _send_start(creator_ws, game, 1)
    if not ok:
        await _end_game(game, winner=2, reason="forfeit")
        return
    await _send_start(ws, game, 2)

    # Start timer for timed mode
    if game["mode"] == "timed":
        asyncio.create_task(_game_timer(game["id"], game["time"]))


async def handle_join_match(ws, data):
    if config.MAX_GAMES and len(manager.games) >= config.MAX_GAMES:
        await ws.send_json({"type": "error", "message": "Server full, try again later"})
        return
    mode = data.get("mode", "timed")
    grid_size = data.get("gridSize", 4)
    time_limit = data.get("time") if mode == "timed" else None
    nickname = data.get("nickname", "Anonymous")
    ws_meta[ws]["nickname"] = nickname

    # Try to pair with an existing waiting player
    key = manager._queue_key(mode, grid_size, time_limit)
    queue = manager.match_queues.get(key)
    if queue and len(queue) > 0:
        ws1 = queue.popleft()
        if len(queue) == 0:
            del manager.match_queues[key]
        ws2 = ws

        # Check ws1 still connected (race condition guard)
        try:
            await ws1.send_json({"type": "ping"})
        except Exception:
            # Waiting player already disconnected — put current back in queue
            manager.enqueue_match(mode, grid_size, time_limit, ws2)
            ws_meta.pop(ws1, None)
            await ws.send_json({"type": "waiting", "room_code": None})
            return

        ws_meta[ws1]["in_game"] = True
        ws_meta[ws2]["in_game"] = True

        game = manager.create_game(
            mode, grid_size, time_limit,
            ws_meta[ws1]["nickname"], nickname,
            ws1, ws2,
        )

        ok1 = await _send_start(ws1, game, 1)
        if not ok1:
            await _end_game(game, winner=2, reason="forfeit")
            return
        await _send_start(ws2, game, 2)

        if game["mode"] == "timed":
            asyncio.create_task(_game_timer(game["id"], game["time"]))
        return

    # No match yet — enqueue
    manager.enqueue_match(mode, grid_size, time_limit, ws)
    await ws.send_json({"type": "waiting", "room_code": None})


async def handle_move(ws, data):
    game, player_num = manager.get_player_game(ws)
    if not game or game["finished"]:
        await ws.send_json({"type": "error", "message": "Not in a game"})
        return

    direction = data.get("direction")
    if direction not in DIRECTIONS:
        await ws.send_json({"type": "error", "message": "Invalid direction"})
        return

    player_key = f"player{player_num}"
    opponent_key = f"player{1 if player_num == 2 else 2}"

    # Client sends its own state after local move. Server trusts it (casual game).
    claimed = data.get("state", {})
    if not claimed:
        await ws.send_json({"type": "error", "message": "Missing state"})
        return

    game[player_key]["score"] = claimed.get("score", 0)
    game[player_key]["state"]["grid"] = claimed.get("grid", [])

    # Broadcast to opponent (value grid for display)
    opponent_ws = game[opponent_key]["ws"]
    try:
        await opponent_ws.send_json({
            "type": "opponent_move",
            "grid": claimed.get("grid", []),
            "score": claimed.get("score", 0),
        })
    except Exception:
        pass

    # Check win: 2048 reached
    if game["mode"] == "race" and claimed.get("reached2048"):
        await _end_game(game, winner=player_num, reason="2048")
        return

    # Check win: board dead
    if claimed.get("gameOver"):
        if game["mode"] == "race":
            await _end_game(game, winner=(1 if player_num == 2 else 2), reason="dead")
        else:
            await player_dead(game, player_num, opponent_key)


async def handle_rematch(ws):
    game, player_num = manager.get_player_game(ws)
    if not game:
        return
    if not game["finished"]:
        return
    game["rematch_requested"].add(player_num)

    if len(game["rematch_requested"]) == 2:
        # Both agree — start new game
        player1 = game["player1"]
        player2 = game["player2"]
        old_id = game["id"]
        manager.delete_game(old_id)

        new_game = manager.create_game(
            game["mode"], game["gridSize"], game.get("time"),
            player1["nickname"], player2["nickname"],
            player1["ws"], player2["ws"],
        )
        await _send_start(player1["ws"], new_game, 1)
        await _send_start(player2["ws"], new_game, 2)

        if new_game["mode"] == "timed":
            asyncio.create_task(_game_timer(new_game["id"], new_game["time"]))


async def handle_cancel(ws):
    manager.remove_from_queue(ws)
    game, player_num = manager.get_player_game(ws)
    if game and not game["finished"]:
        opponent_num = 1 if player_num == 2 else 2
        await _end_game(game, winner=opponent_num, reason="forfeit")
    code = ws_meta.get(ws, {}).get("room_code")
    if code:
        manager.delete_room(code)
    await ws.send_json({"type": "cancelled"})


async def handle_disconnect(ws):
    game, player_num = manager.get_player_game(ws)
    meta = ws_meta.pop(ws, {})

    if game and not game["finished"]:
        opponent_key = f"player{1 if player_num == 2 else 2}"
        opponent_ws = game[opponent_key]["ws"]
        try:
            await opponent_ws.send_json({
                "type": "game_over",
                "winner": "you",
                "reason": "forfeit",
                "your_score": game[opponent_key]["score"],
                "opponent_score": game[f"player{player_num}"]["score"],
            })
        except Exception:
            pass

    manager.cleanup_ws(ws)


# --- Helpers ---

async def player_dead(game, player_num, opponent_key):
    """Handle a player's board reaching dead state. Mode-aware."""
    game[f"player{player_num}"]["dead"] = True
    opp_num = 1 if player_num == 2 else 2
    opponent_ws = game[opponent_key]["ws"]
    # Notify opponent that this player is dead
    try:
        await opponent_ws.send_json({
            "type": "opponent_dead",
            "dead_player": player_num,
        })
    except Exception:
        pass
    # Race mode: immediate loss
    if game["mode"] == "race":
        await _end_game(game, winner=opp_num, reason="dead")
        return
    # Timed mode: check if both dead
    if game["player1"].get("dead") and game["player2"].get("dead"):
        await _end_game(game, reason="dead")


def grid_to_values(state):
    """Convert grid of tile IDs to grid of tile values."""
    tiles = state["tiles"]
    size = state["size"]
    result = [[0] * size for _ in range(size)]
    for r in range(size):
        for c in range(size):
            tid = state["grid"][r][c]
            if tid != 0 and tid in tiles:
                result[r][c] = tiles[tid]["value"]
    return result


def _make_board_payload(state):
    """Serialize game state for client consumption."""
    return {
        "size": state["size"],
        "score": state["score"],
        "reached2048": state.get("reached2048", False),
        "grid": state["grid"],
        "tiles": state["tiles"],
    }


def _make_opponent_board(state):
    """Serialize opponent board with values (not IDs) for mini-board display."""
    return {
        "size": state["size"],
        "score": state["score"],
        "grid": grid_to_values(state),
    }


async def _send_start(ws, game, player_num):
    """Send the 'start' message to a player. Returns True on success."""
    own_key = f"player{player_num}"
    opp_key = f"player{1 if player_num == 2 else 2}"
    payload = {
        "type": "start",
        "game_id": game["id"],
        "your_board": _make_board_payload(game[own_key]["state"]),
        "opponent_board": _make_opponent_board(game[opp_key]["state"]),
        "opponent_nickname": game[opp_key]["nickname"],
        "mode": game["mode"],
        "time": game.get("time"),
        "gridSize": game["gridSize"],
    }
    try:
        await ws.send_json(payload)
        return True
    except Exception:
        return False


async def _end_game(game, winner=0, reason="time"):
    """End game and notify both players. winner: 1=player1, 2=player2, 0=draw."""
    if game.get("finished"):
        return
    game["finished"] = True

    if winner == 1:
        p1_result, p2_result = "you", "opponent"
    elif winner == 2:
        p1_result, p2_result = "opponent", "you"
    else:
        s1 = game["player1"]["score"]
        s2 = game["player2"]["score"]
        if s1 > s2:
            p1_result, p2_result = "you", "opponent"
        elif s2 > s1:
            p1_result, p2_result = "opponent", "you"
        else:
            p1_result, p2_result = "draw", "draw"

    for player_key, result in [("player1", p1_result), ("player2", p2_result)]:
        opp_key = "player2" if player_key == "player1" else "player1"
        try:
            await game[player_key]["ws"].send_json({
                "type": "game_over",
                "winner": result,
                "reason": reason,
                "your_score": game[player_key]["score"],
                "opponent_score": game[opp_key]["score"],
            })
        except Exception:
            pass


async def _game_timer(game_id, total_seconds):
    """Background task: wait for timer, end game if still running."""
    await asyncio.sleep(total_seconds)
    game = manager.get_game(game_id)
    if game and not game["finished"]:
        await _end_game(game, reason="time")


async def _periodic_cleanup():
    """Background task: clean up stale finished games every 5 minutes."""
    while True:
        await asyncio.sleep(300)
        if hasattr(manager, "cleanup_finished_games"):
            await manager.cleanup_finished_games()


# ---- Static file serving (SPA fallback) ----

_static_path = Path(config.STATIC_DIR).resolve()
if _static_path.exists():
    from fastapi.responses import FileResponse

    @app.get("/{path:path}")
    async def serve_spa(path: str):
        """Serve static files, fall back to index.html for SPA routing."""
        file_path = _static_path / path
        if path and file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(_static_path / "index.html")

    print(f"[static] serving {_static_path}")


if __name__ == "__main__":
    config._print_config()
    import uvicorn
    uvicorn.run(
        "server:app",
        host=config.HOST,
        port=config.PORT,
        reload=False,
        limit_max_requests=10000,
        backlog=2048,
    )
