(function () {
  const DEFAULT_SIZE = 4;

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
        if (grid[r][c] === 0) {
          return true;
        }
      }
    }
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const id = grid[r][c];
        if (id === 0) {
          continue;
        }
        const v = tiles[id].value;
        if (r + 1 < size) {
          const downId = grid[r + 1][c];
          if (downId !== 0 && tiles[downId].value === v) {
            return true;
          }
        }
        if (c + 1 < size) {
          const rightId = grid[r][c + 1];
          if (rightId !== 0 && tiles[rightId].value === v) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function newTileValue() {
    return Math.random() < 0.9 ? 2 : 4;
  }

  function addRandomTile(state, events) {
    const empties = collectEmptyCells(state.grid);
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

    const originalPos = {};
    for (let pos = 0; pos < size; pos++) {
      const id = original[pos];
      if (id !== 0) {
        originalPos[id] = pos;
      }
    }

    const targetPos = {};
    for (let pos = 0; pos < size; pos++) {
      const id = nextLine[pos];
      if (id !== 0) {
        targetPos[id] = pos;
      }
    }

    for (const idStr of ids) {
      const fromPos = originalPos[idStr];
      let toPos = targetPos[idStr];

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
    addRandomTile(state, events);
    addRandomTile(state, events);
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
  };
})();

