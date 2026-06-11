"""Room and matchmaking state — all in-memory, no persistence."""
import random
import string
import time
from collections import deque
from game.engine import create_game


def _generate_code(length=6):
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


class RoomManager:
    def __init__(self):
        self.rooms = {}           # code -> Room dict
        self.match_queues = {}    # "{mode}:{time}:{gridSize}" -> deque of WebSocket
        self.games = {}           # game_id -> Game dict
        self._ws_game = {}        # WebSocket -> (game, player_num) — reverse index
        self._ws_queue_key = {}   # WebSocket -> queue key — for O(1) dequeue

    async def create_room(self, mode, grid_size, time_limit=None):
        code = _generate_code()
        while code in self.rooms:
            code = _generate_code()
        self.rooms[code] = {
            "code": code,
            "mode": mode,
            "gridSize": grid_size,
            "time": time_limit,
            "state": "waiting",  # waiting | playing | done
            "creator_ws": None,
            "joiner_ws": None,
            "game_id": None,
        }
        return code

    async def get_room(self, code):
        return self.rooms.get(code)

    async def set_room_creator(self, code, ws):
        """Set creator WebSocket on room. In-memory version: direct mutation."""
        room = self.rooms.get(code)
        if room:
            room["creator_ws"] = ws
        return room

    async def delete_room(self, code):
        self.rooms.pop(code, None)

    async def join_room(self, code, ws):
        room = self.rooms.get(code)
        if not room:
            return None
        if room["state"] != "waiting":
            return None
        if room["joiner_ws"] is not None:
            return None
        room["joiner_ws"] = ws
        room["state"] = "playing"
        return room

    async def enqueue_match(self, mode, grid_size, time_limit, ws):
        key = self._queue_key(mode, grid_size, time_limit)
        if key not in self.match_queues:
            self.match_queues[key] = deque()
        self.match_queues[key].append(ws)
        self._ws_queue_key[ws] = key

    async def dequeue_match(self, mode, grid_size, time_limit):
        """Try to pair. Returns (ws1, ws2) or (None, None) if no match yet."""
        key = self._queue_key(mode, grid_size, time_limit)
        queue = self.match_queues.get(key, deque())
        if len(queue) >= 2:
            ws1 = queue.popleft()
            ws2 = queue.popleft()
            return ws1, ws2
        return None, None

    async def remove_from_queue(self, ws):
        key = self._ws_queue_key.pop(ws, None)
        if key is None:
            return
        queue = self.match_queues.get(key)
        if queue:
            # Remove ws from deque (rare operation, small queue)
            try:
                queue.remove(ws)
            except ValueError:
                pass
            if len(queue) == 0:
                del self.match_queues[key]

    async def create_game(self, mode, grid_size, time_limit, nickname1, nickname2, ws1, ws2):
        game_id = _generate_code(12)
        state1, _ = create_game(grid_size)
        state2, _ = create_game(grid_size)
        game = {
            "id": game_id,
            "mode": mode,
            "gridSize": grid_size,
            "time": time_limit,
            "player1": {"ws": ws1, "nickname": nickname1, "state": state1, "score": 0},
            "player2": {"ws": ws2, "nickname": nickname2, "state": state2, "score": 0},
            "start_time": time.time(),
            "rematch_requested": set(),
            "finished": False,
        }
        self.games[game_id] = game
        self._ws_game[ws1] = (game, 1)
        self._ws_game[ws2] = (game, 2)
        return game

    async def get_game(self, game_id):
        return self.games.get(game_id)

    async def delete_game(self, game_id):
        game = self.games.pop(game_id, None)
        if game:
            self._ws_game.pop(game["player1"]["ws"], None)
            self._ws_game.pop(game["player2"]["ws"], None)

    async def get_player_game(self, ws):
        entry = self._ws_game.get(ws)
        if entry:
            return entry
        return None, 0

    async def cleanup_ws(self, ws):
        """Remove ws from everything — queues, rooms (as creator), games."""
        await self.remove_from_queue(ws)
        self._ws_game.pop(ws, None)
        for code in list(self.rooms.keys()):
            room = self.rooms[code]
            if room["creator_ws"] == ws:
                await self.delete_room(code)

    async def cleanup_finished_games(self, max_age_seconds=300):
        """Remove finished games older than max_age_seconds. Call periodically."""
        now = time.time()
        stale = []
        for gid, game in self.games.items():
            if game.get("finished") and now - game.get("start_time", 0) > max_age_seconds:
                stale.append(gid)
        for gid in stale:
            await self.delete_game(gid)

    @staticmethod
    def _queue_key(mode, grid_size, time_limit):
        t = time_limit if time_limit else 0
        return f"{mode}:{t}:{grid_size}"
