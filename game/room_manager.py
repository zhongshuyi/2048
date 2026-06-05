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
        self.rooms = {}       # code -> Room dict
        self.match_queues = {}  # "{mode}:{time}:{gridSize}" -> list of WebSocket
        self.games = {}       # game_id -> Game dict

    def create_room(self, mode, grid_size, time_limit=None):
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

    def get_room(self, code):
        return self.rooms.get(code)

    def delete_room(self, code):
        self.rooms.pop(code, None)

    def join_room(self, code, ws):
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

    def enqueue_match(self, mode, grid_size, time_limit, ws):
        key = self._queue_key(mode, grid_size, time_limit)
        if key not in self.match_queues:
            self.match_queues[key] = deque()
        self.match_queues[key].append(ws)

    def dequeue_match(self, mode, grid_size, time_limit):
        """Try to pair. Returns (ws1, ws2) or (None, None) if no match yet."""
        key = self._queue_key(mode, grid_size, time_limit)
        queue = self.match_queues.get(key, [])
        if len(queue) >= 2:
            ws1 = queue.popleft()
            ws2 = queue.popleft()
            return ws1, ws2
        return None, None

    def remove_from_queue(self, ws):
        for key in list(self.match_queues.keys()):
            queue = self.match_queues[key]
            new_queue = deque([w for w in queue if w != ws])
            self.match_queues[key] = new_queue
            if len(new_queue) == 0:
                del self.match_queues[key]

    def create_game(self, mode, grid_size, time_limit, nickname1, nickname2, ws1, ws2):
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
        return game

    def get_game(self, game_id):
        return self.games.get(game_id)

    def delete_game(self, game_id):
        self.games.pop(game_id, None)

    def get_player_game(self, ws):
        for gid, game in self.games.items():
            if game["player1"]["ws"] == ws:
                return game, 1
            if game["player2"]["ws"] == ws:
                return game, 2
        return None, 0

    def cleanup_ws(self, ws):
        """Remove ws from everything — queues, rooms (as creator), games."""
        self.remove_from_queue(ws)
        for code in list(self.rooms.keys()):
            room = self.rooms[code]
            if room["creator_ws"] == ws:
                self.delete_room(code)
        for gid in list(self.games.keys()):
            game = self.games[gid]
            if game["player1"]["ws"] == ws or game["player2"]["ws"] == ws:
                if not game["finished"]:
                    game["finished"] = True

    @staticmethod
    def _queue_key(mode, grid_size, time_limit):
        t = time_limit if time_limit else 0
        return f"{mode}:{t}:{grid_size}"
