"""Python port of Engine2048 -- identical logic to js/game-engine.js."""
import random
import copy


def create_game(size=4):
    """Create a fresh game state with two random tiles spawned."""
    s = size if (isinstance(size, int) and size > 0) else 4
    state = {
        "size": s,
        "score": 0,
        "reached2048": False,
        "nextId": 1,
        "grid": _create_empty_grid(s),
        "tiles": {},
    }
    events = {"moves": [], "merges": [], "spawns": [], "removes": []}
    _add_random_tile(state, events)
    _add_random_tile(state, events)
    return state, events


def move(state, direction):
    """Apply a move. Returns (new_state, moved, score_gained, reached2048, game_over, events)."""
    if direction not in ("left", "right", "up", "down"):
        return (copy_state(state), False, 0, state.get("reached2048", False), False,
                {"moves": [], "merges": [], "spawns": [], "removes": []})

    next_state = copy_state(state)
    events = {"moves": [], "merges": [], "spawns": [], "removes": []}

    moved = False
    score_gained = 0
    for i in range(next_state["size"]):
        result = _move_line(next_state, direction, i, events)
        if result["changed"]:
            moved = True
        score_gained += result["scoreGained"]
    next_state["score"] += score_gained

    if not moved:
        return (next_state, False, 0, next_state.get("reached2048", False),
                not _can_move(next_state),
                {"moves": [], "merges": [], "spawns": [], "removes": []})

    _add_random_tile(next_state, events)

    if not next_state.get("reached2048", False):
        for t in next_state["tiles"].values():
            if t["value"] == 2048:
                next_state["reached2048"] = True
                break

    game_over = not _can_move(next_state)
    return (next_state, True, score_gained, next_state.get("reached2048", False), game_over, events)


def can_move(state):
    return _can_move(state)


def copy_state(state):
    """Deep-copy game state (no shared references)."""
    tiles = {}
    for tid, t in state["tiles"].items():
        tiles[tid] = {"id": t["id"], "value": t["value"], "r": t["r"], "c": t["c"]}
    return {
        "size": state["size"],
        "score": state["score"],
        "reached2048": state.get("reached2048", False),
        "nextId": state["nextId"],
        "grid": [row[:] for row in state["grid"]],
        "tiles": tiles,
    }


# --- Internal helpers ---

def _create_empty_grid(size):
    return [[0] * size for _ in range(size)]


def _collect_empty_cells(grid):
    empties = []
    for r in range(len(grid)):
        for c in range(len(grid)):
            if grid[r][c] == 0:
                empties.append({"r": r, "c": c})
    return empties


def _new_tile_value():
    return 2 if random.random() < 0.9 else 4


def _add_random_tile(state, events):
    empties = _collect_empty_cells(state["grid"])
    if not empties:
        return
    spot = random.choice(empties)
    tid = str(state["nextId"])
    state["nextId"] += 1
    value = _new_tile_value()
    state["grid"][spot["r"]][spot["c"]] = tid
    state["tiles"][tid] = {"id": tid, "value": value, "r": spot["r"], "c": spot["c"]}
    events["spawns"].append({"id": tid, "at": {"r": spot["r"], "c": spot["c"]}, "value": value})


def _can_move(state):
    grid = state["grid"]
    tiles = state["tiles"]
    size = state["size"]
    for r in range(size):
        for c in range(size):
            if grid[r][c] == 0:
                return True
    for r in range(size):
        for c in range(size):
            tid = grid[r][c]
            if tid == 0:
                continue
            v = tiles[tid]["value"]
            if r + 1 < size:
                down_id = grid[r + 1][c]
                if down_id != 0 and tiles[down_id]["value"] == v:
                    return True
            if c + 1 < size:
                right_id = grid[r][c + 1]
                if right_id != 0 and tiles[right_id]["value"] == v:
                    return True
    return False


def _read_line(grid, size, direction, index):
    ids = []
    if direction == "left":
        for c in range(size):
            ids.append(grid[index][c])
    elif direction == "right":
        for c in range(size - 1, -1, -1):
            ids.append(grid[index][c])
    elif direction == "up":
        for r in range(size):
            ids.append(grid[r][index])
    elif direction == "down":
        for r in range(size - 1, -1, -1):
            ids.append(grid[r][index])
    return ids


def _write_line(grid, size, direction, index, line):
    if direction == "left":
        for c in range(size):
            grid[index][c] = line[c]
    elif direction == "right":
        for c in range(size - 1, -1, -1):
            grid[index][c] = line[size - 1 - c]
    elif direction == "up":
        for r in range(size):
            grid[r][index] = line[r]
    elif direction == "down":
        for r in range(size - 1, -1, -1):
            grid[r][index] = line[size - 1 - r]


def _to_coord(direction, index, line_pos, size):
    if direction == "left":
        return {"r": index, "c": line_pos}
    if direction == "right":
        return {"r": index, "c": size - 1 - line_pos}
    if direction == "up":
        return {"r": line_pos, "c": index}
    return {"r": size - 1 - line_pos, "c": index}


def _move_line(state, direction, line_index, events):
    size = state["size"]
    tiles = state["tiles"]
    original = _read_line(state["grid"], size, direction, line_index)
    ids = [x for x in original if x != 0]

    next_line = [0] * size
    merges = []
    score_gained = 0

    write_pos = 0
    i = 0
    while i < len(ids):
        a = ids[i]
        b = ids[i + 1] if i + 1 < len(ids) else None
        if b and tiles[a]["value"] == tiles[b]["value"]:
            new_value = tiles[a]["value"] * 2
            next_line[write_pos] = a
            merges.append({"intoId": a, "fromIds": [a, b], "toPos": write_pos, "newValue": new_value})
            score_gained += new_value
            i += 2
            write_pos += 1
        else:
            next_line[write_pos] = a
            i += 1
            write_pos += 1

    # Compute moves
    original_pos = {}
    for pos in range(size):
        tid = original[pos]
        if tid != 0:
            original_pos[tid] = pos

    target_pos = {}
    for pos in range(size):
        tid = next_line[pos]
        if tid != 0:
            target_pos[tid] = pos

    for tid in ids:
        from_pos = original_pos.get(tid)
        to_pos = target_pos.get(tid)
        merge = next((m for m in merges if m["fromIds"][1] == tid), None)
        if merge:
            to_pos = merge["toPos"]
        if from_pos is not None and to_pos is not None and from_pos != to_pos:
            fr = _to_coord(direction, line_index, from_pos, size)
            to = _to_coord(direction, line_index, to_pos, size)
            events["moves"].append({"id": tid, "from": fr, "to": to})

    # Update tile positions
    for pos in range(size):
        tid = next_line[pos]
        if tid == 0:
            continue
        to = _to_coord(direction, line_index, pos, size)
        tiles[tid]["r"] = to["r"]
        tiles[tid]["c"] = to["c"]

    # Apply merges
    for m in merges:
        into_id = m["intoId"]
        from_ids = m["fromIds"]
        new_value = m["newValue"]
        tiles[into_id]["value"] = new_value
        del tiles[from_ids[1]]
        events["removes"].append({"id": from_ids[1]})
        events["merges"].append({
            "intoId": into_id,
            "fromIds": from_ids,
            "to": _to_coord(direction, line_index, m["toPos"], size),
            "newValue": new_value,
        })

    _write_line(state["grid"], size, direction, line_index, next_line)

    changed = ",".join(str(x) for x in original) != ",".join(str(x) for x in next_line)
    return {"changed": changed, "scoreGained": score_gained}
