"""Redis-backed RoomManager — supports multi-worker horizontal scaling."""
import json
import random
import string
import time
from collections import deque

import redis.asyncio as redis
from game.engine import create_game as engine_create_game


def _generate_code(length=6):
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


class RedisRoomManager:
    """RoomManager backed by Redis. Drop-in replacement for RoomManager.
    Uses Redis hashes for rooms/games, lists for queues, pub/sub for cross-worker events.
    Each worker maintains a local WebSocket registry mapped by ws_id.
    """

    def __init__(self, redis_url="redis://localhost:6379"):
        self.redis = None
        self._url = redis_url
        self._ws_registry = {}  # ws_id -> WebSocket
        self._ws_id_counter = 0
        self._pubsub = None
        self._rooms = {}   # local cache for WebSocket objects (can't serialize)
        self._games = {}   # local cache
        self.match_queues = {}
        self.games = {}    # expose for MAX_GAMES guard

    async def _ensure_connected(self):
        if self.redis is None:
            self.redis = redis.from_url(self._url, decode_responses=True)
        if self._pubsub is None:
            self._pubsub = self.redis.pubsub()
            await self._pubsub.subscribe("2048:events")
            asyncio_create_task_global(self._listen_events())

    def _register_ws(self, ws):
        """Assign a unique ID to a WebSocket for cross-worker references."""
        self._ws_id_counter += 1
        ws_id = f"ws:{self._ws_id_counter}"
        self._ws_registry[ws_id] = ws
        return ws_id

    def _get_ws(self, ws_id):
        return self._ws_registry.get(ws_id)

    # ---- Rooms ----

    async def create_room(self, mode, grid_size, time_limit=None):
        await self._ensure_connected()
        code = _generate_code()
        while await self.redis.hexists("rooms", code):
            code = _generate_code()
        room = {"mode": mode, "gridSize": grid_size, "time": time_limit or 0, "state": "waiting"}
        await self.redis.hset("rooms", code, json.dumps(room))
        return code

    async def get_room(self, code):
        await self._ensure_connected()
        raw = await self.redis.hget("rooms", code)
        if not raw:
            return None
        room = json.loads(raw)
        # Reconstruct WebSocket objects from stored IDs
        if room.get("creator_id"):
            room["creator_ws"] = self._get_ws(room["creator_id"])
        if room.get("joiner_id"):
            room["joiner_ws"] = self._get_ws(room["joiner_id"])
        return room

    async def set_room_creator(self, code, ws):
        """Persist the creator WebSocket reference to Redis."""
        await self._ensure_connected()
        raw = await self.redis.hget("rooms", code)
        if not raw:
            return None
        room = json.loads(raw)
        ws_id = self._register_ws(ws)
        room["creator_id"] = ws_id
        room["creator_ws"] = ws  # also set locally for immediate use
        await self.redis.hset("rooms", code, json.dumps(room))
        self._rooms[code] = room
        return room

    async def delete_room(self, code):
        await self._ensure_connected()
        await self.redis.hdel("rooms", code)
        self._rooms.pop(code, None)

    async def join_room(self, code, ws):
        await self._ensure_connected()
        raw = await self.redis.hget("rooms", code)
        if not raw:
            return None
        room = json.loads(raw)
        if room["state"] != "waiting":
            return None
        room["state"] = "playing"
        ws_id = self._register_ws(ws)
        room["joiner_id"] = ws_id
        room["joiner_ws"] = ws
        # Reconstruct creator_ws from stored ID
        if room.get("creator_id"):
            room["creator_ws"] = self._get_ws(room["creator_id"])
        await self.redis.hset("rooms", code, json.dumps(room))
        self._rooms[code] = room
        return room

    # ---- Match queues ----

    async def enqueue_match(self, mode, grid_size, time_limit, ws):
        await self._ensure_connected()
        key = self._queue_key(mode, grid_size, time_limit)
        ws_id = self._register_ws(ws)
        await self.redis.rpush(f"queue:{key}", ws_id)
        await self.redis.set(f"ws_queue:{ws_id}", key)

    async def dequeue_match(self, mode, grid_size, time_limit):
        """Try to pair. Returns (ws1, ws2) or (None, None)."""
        await self._ensure_connected()
        key = self._queue_key(mode, grid_size, time_limit)
        ws1_id = await self.redis.lpop(f"queue:{key}")
        ws2_id = await self.redis.lpop(f"queue:{key}")
        if ws1_id and ws2_id:
            ws1 = self._get_ws(ws1_id)
            ws2 = self._get_ws(ws2_id)
            await self.redis.delete(f"ws_queue:{ws1_id}", f"ws_queue:{ws2_id}")
            if ws1 and ws2:
                return ws1, ws2
        # Put back if only one was found or WS is gone
        if ws1_id:
            ws1 = self._get_ws(ws1_id)
            if ws1:
                await self.redis.lpush(f"queue:{key}", ws1_id)
        if ws2_id:
            ws2 = self._get_ws(ws2_id)
            if ws2:
                await self.redis.lpush(f"queue:{key}", ws2_id)
        return None, None

    async def remove_from_queue(self, ws):
        await self._ensure_connected()
        ws_id = self._find_ws_id(ws)
        if ws_id:
            key = await self.redis.get(f"ws_queue:{ws_id}")
            if key:
                await self.redis.lrem(f"queue:{key}", 0, ws_id)
                await self.redis.delete(f"ws_queue:{ws_id}")

    # ---- Games ----

    async def create_game(self, mode, grid_size, time_limit, nickname1, nickname2, ws1, ws2):
        await self._ensure_connected()
        game_id = _generate_code(12)
        ws1_id = self._register_ws(ws1)
        ws2_id = self._register_ws(ws2)

        # Create initial game states (same as in-memory RoomManager)
        state1, _ = engine_create_game(grid_size)
        state2, _ = engine_create_game(grid_size)

        game = {
            "id": game_id, "mode": mode, "gridSize": grid_size, "time": time_limit or 0,
            "player1_ws": ws1_id, "player2_ws": ws2_id,
            "player1_nick": nickname1, "player2_nick": nickname2,
            "player1_score": 0, "player2_score": 0,
            "player1_state": json.dumps(state1), "player2_state": json.dumps(state2),
            "start_time": time.time(), "finished": False,
        }
        await self.redis.hset("games", game_id, json.dumps(game))
        self.games[game_id] = {  # lightweight local cache for MAX_GAMES
            "id": game_id, "finished": False,
            "player1": {"ws": ws1}, "player2": {"ws": ws2},
        }
        return self._build_local_game(game, ws1_id, ws2_id)

    async def get_game(self, game_id):
        await self._ensure_connected()
        raw = await self.redis.hget("games", game_id)
        if raw:
            g = json.loads(raw)
            return self._build_local_game(g, g["player1_ws"], g["player2_ws"])
        return None

    async def delete_game(self, game_id):
        await self._ensure_connected()
        await self.redis.hdel("games", game_id)
        self.games.pop(game_id, None)

    async def get_player_game(self, ws):
        await self._ensure_connected()
        ws_id = self._find_ws_id(ws)
        if not ws_id:
            return None, 0
        # Scan all games in local cache first
        for gid in self.games:
            game = self.games[gid]
            if game.get("player1", {}).get("ws") == ws:
                full = await self.get_game(gid)
                return full, 1
            if game.get("player2", {}).get("ws") == ws:
                full = await self.get_game(gid)
                return full, 2
        return None, 0

    async def cleanup_ws(self, ws):
        ws_id = self._find_ws_id(ws)
        if ws_id:
            self._ws_registry.pop(ws_id, None)
        await self.remove_from_queue(ws)

    async def cleanup_finished_games(self, max_age_seconds=300):
        await self._ensure_connected()
        now = time.time()
        raw_games = await self.redis.hgetall("games")
        for gid, raw in raw_games.items():
            g = json.loads(raw)
            if g.get("finished") and now - g.get("start_time", 0) > max_age_seconds:
                await self.delete_game(gid)

    # ---- Helpers ----

    def _find_ws_id(self, ws):
        for wid, w in self._ws_registry.items():
            if w == ws:
                return wid
        return None

    def _build_local_game(self, raw, ws1_id, ws2_id):
        """Build game object with actual WebSocket references for server handlers."""
        ws1 = self._get_ws(ws1_id)
        ws2 = self._get_ws(ws2_id)
        p1_state = json.loads(raw.get("player1_state", "{}")) if isinstance(raw.get("player1_state"), str) else raw.get("player1_state", {})
        p2_state = json.loads(raw.get("player2_state", "{}")) if isinstance(raw.get("player2_state"), str) else raw.get("player2_state", {})
        return {
            "id": raw["id"], "mode": raw["mode"], "gridSize": raw["gridSize"],
            "time": raw["time"], "finished": raw.get("finished", False),
            "player1": {"ws": ws1, "nickname": raw["player1_nick"], "state": p1_state, "score": raw.get("player1_score", 0)},
            "player2": {"ws": ws2, "nickname": raw["player2_nick"], "state": p2_state, "score": raw.get("player2_score", 0)},
            "start_time": raw.get("start_time", 0), "rematch_requested": set(),
        }

    @staticmethod
    def _queue_key(mode, grid_size, time_limit):
        t = time_limit if time_limit else 0
        return f"{mode}:{t}:{grid_size}"

    async def _listen_events(self):
        """Background task: listen for cross-worker pub/sub events."""
        async for msg in self._pubsub.listen():
            if msg["type"] != "message":
                continue


def asyncio_create_task_global(coro):
    """Schedule coroutine on the running event loop."""
    import asyncio
    loop = asyncio.get_event_loop()
    loop.create_task(coro)
