(function () {
  const DEFAULT_SIZE = 4;

  const TILE_STYLES = {
    2:    { bg: 0xeee4da, fg: 0x776e65, size: 44 },
    4:    { bg: 0xede0c8, fg: 0x776e65, size: 44 },
    8:    { bg: 0xf2b179, fg: 0xf9f6f2, size: 44 },
    16:   { bg: 0xf59563, fg: 0xf9f6f2, size: 44 },
    32:   { bg: 0xf67c5f, fg: 0xf9f6f2, size: 44 },
    64:   { bg: 0xf65e3b, fg: 0xf9f6f2, size: 44 },
    128:  { bg: 0xedcf72, fg: 0xf9f6f2, size: 38 },
    256:  { bg: 0xedcc61, fg: 0xf9f6f2, size: 38 },
    512:  { bg: 0xedc850, fg: 0xf9f6f2, size: 38 },
    1024: { bg: 0xedc53f, fg: 0xf9f6f2, size: 32 },
    2048: { bg: 0xedc22e, fg: 0xf9f6f2, size: 32 },
  };

  const TILE_COLORS = {
    2: "#eee4da", 4: "#ede0c8", 8: "#f2b179", 16: "#f59563",
    32: "#f67c5f", 64: "#f65e3b", 128: "#edcf72", 256: "#edcc61",
    512: "#edc850", 1024: "#edc53f", 2048: "#edc22e",
  };

  function cloneGrid(grid) {
    return grid.map((row) => row.slice());
  }

  function createEmptyGrid(size) {
    const grid = [];
    for (let r = 0; r < size; r++) {
      const row = new Array(size).fill(0);
      grid.push(row);
    }
    return grid;
  }

  function pickRandom(list) {
    if (list.length === 0) {
      return null;
    }
    const idx = Math.floor(Math.random() * list.length);
    return list[idx];
  }

  function collectEmptyCells(grid) {
    const empties = [];
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid.length; c++) {
        if (grid[r][c] === 0) {
          empties.push({ r, c });
        }
      }
    }
    return empties;
  }

  function canMove(state) {
    const { grid, tiles, size } = state;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const id = grid[r][c];
        if (id === 0) return true;
        const v = tiles[id].value;
        if (r + 1 < size) {
          const downId = grid[r + 1][c];
          if (downId === 0 || tiles[downId].value === v) return true;
        }
        if (c + 1 < size) {
          const rightId = grid[r][c + 1];
          if (rightId === 0 || tiles[rightId].value === v) return true;
        }
      }
    }
    return false;
  }

  function newTileValue() {
    return Math.random() < 0.9 ? 2 : 4;
  }

  function addRandomTile(state, events, excludeAdjacentTo) {
    var empties = collectEmptyCells(state.grid);
    if (excludeAdjacentTo) {
      var filtered = [];
      for (var i = 0; i < empties.length; i++) {
        var cell = empties[i];
        if (Math.abs(cell.r - excludeAdjacentTo.r) + Math.abs(cell.c - excludeAdjacentTo.c) > 1) {
          filtered.push(cell);
        }
      }
      if (filtered.length > 0) empties = filtered;
    }
    const spot = pickRandom(empties);
    if (!spot) {
      return;
    }
    const id = String(state.nextId++);
    const value = newTileValue();
    state.grid[spot.r][spot.c] = id;
    state.tiles[id] = { id, value, r: spot.r, c: spot.c };
    events.spawns.push({ id, at: { r: spot.r, c: spot.c }, value });
  }

  function readLine(grid, size, direction, index) {
    const ids = [];
    if (direction === "left") {
      for (let c = 0; c < size; c++) ids.push(grid[index][c]);
    } else if (direction === "right") {
      for (let c = size - 1; c >= 0; c--) ids.push(grid[index][c]);
    } else if (direction === "up") {
      for (let r = 0; r < size; r++) ids.push(grid[r][index]);
    } else if (direction === "down") {
      for (let r = size - 1; r >= 0; r--) ids.push(grid[r][index]);
    }
    return ids;
  }

  function writeLine(grid, size, direction, index, line) {
    if (direction === "left") {
      for (let c = 0; c < size; c++) grid[index][c] = line[c];
    } else if (direction === "right") {
      for (let c = size - 1, i = 0; c >= 0; c--, i++) grid[index][c] = line[i];
    } else if (direction === "up") {
      for (let r = 0; r < size; r++) grid[r][index] = line[r];
    } else if (direction === "down") {
      for (let r = size - 1, i = 0; r >= 0; r--, i++) grid[r][index] = line[i];
    }
  }

  function toCoord(direction, index, linePos, size) {
    if (direction === "left") return { r: index, c: linePos };
    if (direction === "right") return { r: index, c: size - 1 - linePos };
    if (direction === "up") return { r: linePos, c: index };
    return { r: size - 1 - linePos, c: index };
  }

  function moveLine(state, direction, lineIndex, events) {
    const { size, tiles } = state;
    const original = readLine(state.grid, size, direction, lineIndex);
    const ids = original.filter((x) => x !== 0);

    const nextLine = new Array(size).fill(0);
    const merges = [];
    let scoreGained = 0;

    let writePos = 0;
    let i = 0;
    while (i < ids.length) {
      const a = ids[i];
      const b = ids[i + 1];
      if (b && tiles[a].value === tiles[b].value) {
        const destId = a;
        const newValue = tiles[a].value * 2;
        nextLine[writePos] = destId;
        merges.push({ intoId: destId, fromIds: [a, b], toPos: writePos, newValue });
        scoreGained += newValue;
        i += 2;
        writePos++;
        continue;
      }
      nextLine[writePos] = a;
      i += 1;
      writePos++;
    }

    const originalPos = new Map();
    for (let pos = 0; pos < size; pos++) {
      const id = original[pos];
      if (id !== 0) originalPos.set(id, pos);
    }

    const targetPos = new Map();
    for (let pos = 0; pos < size; pos++) {
      const id = nextLine[pos];
      if (id !== 0) targetPos.set(id, pos);
    }

    for (const idStr of ids) {
      const fromPos = originalPos.get(idStr);
      let toPos = targetPos.get(idStr);

      const merge = merges.find((m) => m.fromIds[1] === idStr);
      if (merge) {
        toPos = merge.toPos;
      }

      if (fromPos != null && toPos != null && fromPos !== toPos) {
        const from = toCoord(direction, lineIndex, fromPos, size);
        const to = toCoord(direction, lineIndex, toPos, size);
        events.moves.push({ id: idStr, from, to });
      }
    }

    for (let pos = 0; pos < size; pos++) {
      const id = nextLine[pos];
      if (id === 0) continue;
      const to = toCoord(direction, lineIndex, pos, size);
      tiles[id].r = to.r;
      tiles[id].c = to.c;
    }

    for (const m of merges) {
      const { intoId, fromIds, newValue } = m;
      tiles[intoId].value = newValue;
      delete tiles[fromIds[1]];
      events.removes.push({ id: fromIds[1] });
      events.merges.push({
        intoId,
        fromIds,
        to: toCoord(direction, lineIndex, m.toPos, size),
        newValue,
      });
    }

    writeLine(state.grid, size, direction, lineIndex, nextLine);

    return { changed: original.join(",") !== nextLine.join(","), scoreGained };
  }

  function copyState(state) {
    const tiles = {};
    for (const [id, t] of Object.entries(state.tiles)) {
      tiles[id] = { id: t.id, value: t.value, r: t.r, c: t.c };
    }
    return {
      size: state.size,
      score: state.score,
      reached2048: state.reached2048,
      nextId: state.nextId,
      grid: cloneGrid(state.grid),
      tiles,
    };
  }

  function createGame(size) {
    const s = typeof size === "number" && size > 0 ? size : DEFAULT_SIZE;
    const state = {
      size: s,
      score: 0,
      reached2048: false,
      nextId: 1,
      grid: createEmptyGrid(s),
      tiles: {},
    };
    const events = { moves: [], merges: [], spawns: [], removes: [] };
    const empties = collectEmptyCells(state.grid);
    const firstSpot = pickRandom(empties);
    if (firstSpot) {
      const id = String(state.nextId++);
      const value = newTileValue();
      state.grid[firstSpot.r][firstSpot.c] = id;
      state.tiles[id] = { id, value, r: firstSpot.r, c: firstSpot.c };
      events.spawns.push({ id, at: { r: firstSpot.r, c: firstSpot.c }, value });
    }
    addRandomTile(state, events, firstSpot);
    return { state, events };
  }

  function move(state, direction) {
    if (!["left", "right", "up", "down"].includes(direction)) {
      return { state: copyState(state), moved: false, scoreGained: 0, reached2048: state.reached2048, gameOver: false, events: { moves: [], merges: [], spawns: [], removes: [] } };
    }

    const next = copyState(state);
    const events = { moves: [], merges: [], spawns: [], removes: [] };

    let moved = false;
    let scoreGained = 0;
    for (let i = 0; i < next.size; i++) {
      const { changed, scoreGained: lineScore } = moveLine(next, direction, i, events);
      if (changed) moved = true;
      scoreGained += lineScore;
    }
    next.score += scoreGained;

    if (!moved) {
      return {
        state: next,
        moved: false,
        scoreGained: 0,
        reached2048: next.reached2048,
        gameOver: !canMove(next),
        events: { moves: [], merges: [], spawns: [], removes: [] },
      };
    }

    addRandomTile(next, events);

    if (!next.reached2048) {
      for (const t of Object.values(next.tiles)) {
        if (t.value === 2048) {
          next.reached2048 = true;
          break;
        }
      }
    }

    const gameOver = !canMove(next);
    return { state: next, moved: true, scoreGained, reached2048: next.reached2048, gameOver, events };
  }

  window.Engine2048 = {
    createGame,
    move,
    TILE_STYLES: TILE_STYLES,
    TILE_COLORS: TILE_COLORS,
  };
})();

