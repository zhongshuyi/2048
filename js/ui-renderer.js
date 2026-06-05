(function () {
  function clampInt(n) {
    if (typeof n !== "number") return 0;
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
  }

  // CSS cubic-bezier matching: precompute lookup table once
  var CUBIC_SAMPLES = 128;
  var EASE_OUT_TABLE = buildCubicBezierLUT(0.0, 0.0, 0.58, 1.0, CUBIC_SAMPLES);
  var EASE_TABLE = buildCubicBezierLUT(0.25, 0.1, 0.25, 1.0, CUBIC_SAMPLES);

  function buildCubicBezierLUT(x1, y1, x2, y2, n) {
    var lut = new Float32Array(n + 1);
    // sample the bezier curve at regular parameter intervals, then
    // for each target x we find the nearest sample
    var samples = [];
    var steps = n * 4;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      // bezier x(t)
      var cx = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
      var cy = 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
      samples.push({ x: cx, y: cy });
    }
    // nearest-neighbour lookup for each integer index 0..n
    for (var ix = 0; ix <= n; ix++) {
      var targetX = ix / n;
      var best = samples[0].y;
      var bestDist = Infinity;
      for (var si = 0; si < samples.length; si++) {
        var d = Math.abs(samples[si].x - targetX);
        if (d < bestDist) { bestDist = d; best = samples[si].y; }
      }
      lut[ix] = best;
    }
    return lut;
  }

  function cubicBezierLerp(t, lut) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    var idx = t * (lut.length - 1);
    var lo = Math.floor(idx);
    var hi = Math.min(lo + 1, lut.length - 1);
    var frac = idx - lo;
    return lut[lo] + (lut[hi] - lut[lo]) * frac;
  }

  function cssEaseOut(t) {
    return cubicBezierLerp(t, EASE_OUT_TABLE);
  }

  function cssEase(t) {
    return cubicBezierLerp(t, EASE_TABLE);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function parseCssPxVar(name, fallback) {
    const styles = getComputedStyle(document.documentElement);
    const raw = styles.getPropertyValue(name).trim();
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : fallback;
  }

  function parseCssMsVar(name, fallback) {
    const styles = getComputedStyle(document.documentElement);
    const raw = styles.getPropertyValue(name).trim();
    const m = raw.match(/^(\d+(?:\.\d+)?)ms$/);
    if (!m) return fallback;
    const v = Number(m[1]);
    return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : fallback;
  }

  function valueStyle(value, scale) {
    var s = typeof scale === "number" && Number.isFinite(scale) ? scale : 1;
    var map = {
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
    var base = map[value];
    if (!base) {
      base = value <= 4096
        ? { bg: 0x3c3a32, fg: 0xf9f6f2, size: 30 }
        : value <= 8192
          ? { bg: 0x3c3a32, fg: 0xf9f6f2, size: 28 }
          : { bg: 0x3c3a32, fg: 0xf9f6f2, size: 26 };
    }
    var size = Math.max(10, Math.round(base.size * s));
    return { bg: base.bg, fg: base.fg, size: size };
  }

  function Renderer(options) {
    this.size = options.size;
    this.boardEl = options.boardEl;
    this.stageEl = options.stageEl;
    this.overlayEl = options.overlayEl;
    this.overlayTitleEl = options.overlayTitleEl;
    this.statusEl = options.statusEl;
    this.scoreEl = options.scoreEl;
    this.bestEl = options.bestEl;

    this.app = null;
    this.layers = null;
    this.tiles = new Map();

    this.gap = 0;
    this.cellSize = 0;
    this.boardSize = 0;

    this.handleResize = null;
    this.handleOrientation = null;
  }

  Renderer.prototype.updateScore = function updateScore(score, best) {
    this.scoreEl.textContent = String(clampInt(score));
    this.bestEl.textContent = String(clampInt(best));
  };

  Renderer.prototype.animateScore = function (fromVal, toVal, best) {
    var self = this;
    var duration = 350;
    var start = performance.now();
    var ticker = this.app.ticker;
    function tick() {
      var t = (performance.now() - start) / duration;
      if (t >= 1) {
        self.scoreEl.textContent = String(clampInt(toVal));
        ticker.remove(tick);
        return;
      }
      var current = Math.round(lerp(fromVal, toVal, cssEaseOut(Math.min(1, t))));
      self.scoreEl.textContent = String(clampInt(current));
    }
    ticker.add(tick);
    this.bestEl.textContent = String(clampInt(best));
  };

  Renderer.prototype.updateStatus = function updateStatus(reached2048) {
    this.statusEl.textContent = reached2048 ? "已达成 2048，可继续挑战更高分。" : "";
  };

  Renderer.prototype.showOverlay = function showOverlay(title) {
    this.overlayTitleEl.textContent = title || "Game over!";
    this.overlayEl.hidden = false;
  };

  Renderer.prototype.hideOverlay = function hideOverlay() {
    this.overlayEl.hidden = true;
  };

  Renderer.prototype.measure = function measure() {
    const size = this.boardEl.clientWidth || parseCssPxVar("--board-size", 500);
    this.boardSize = Math.floor(size);
    this.gap = parseCssPxVar("--gap", 15);
    this.cellSize = (this.boardSize - this.gap * (this.size + 1)) / this.size;
  };

  Renderer.prototype.cellToXY = function cellToXY(r, c) {
    const x = this.gap + c * (this.cellSize + this.gap);
    const y = this.gap + r * (this.cellSize + this.gap);
    return { x, y };
  };

  Renderer.prototype.cellToCenter = function cellToCenter(r, c) {
    const p = this.cellToXY(r, c);
    return { x: p.x + this.cellSize / 2, y: p.y + this.cellSize / 2 };
  };

  Renderer.prototype.init = function init() {
    if (!window.PIXI) {
      throw new Error("PIXI not found");
    }
    this.measure();

    this.app = new window.PIXI.Application({
      width: this.boardSize,
      height: this.boardSize,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      preserveDrawingBuffer: true,
    });

    this.stageEl.innerHTML = "";
    this.stageEl.appendChild(this.app.view);

    const root = new window.PIXI.Container();
    const board = new window.PIXI.Graphics();
    const cells = new window.PIXI.Graphics();
    const tiles = new window.PIXI.Container();
    root.addChild(board);
    root.addChild(cells);
    root.addChild(tiles);
    this.app.stage.addChild(root);

    this.layers = { root, board, cells, tiles };
    this.drawStatic();

    this.handleResize = () => this.resize();
    window.addEventListener("resize", this.handleResize);
    this.handleOrientation = () => {
      window.setTimeout(() => this.resize(), 60);
    };
    window.addEventListener("orientationchange", this.handleOrientation);
  };

  Renderer.prototype.resize = function resize() {
    if (!this.app) return;
    var before = this.boardSize;
    this.measure();
    if (this.boardSize !== before) {
      this.app.renderer.resize(this.boardSize, this.boardSize);
    }
    this.drawStatic();
    for (var _i = 0, _vals = Array.from(this.tiles.values()); _i < _vals.length; _i++) {
      var tile = _vals[_i];
      this.redrawTile(tile);
      tile.container.pivot.set(this.cellSize / 2, this.cellSize / 2);
      var pos = this.cellToCenter(tile.r, tile.c);
      tile.container.position.set(pos.x, pos.y);
    }
  };

  Renderer.prototype.drawStatic = function drawStatic() {
    var bRadius = 10;
    this.layers.board.clear();
    this.layers.board.beginFill(0xbbada0, 1);
    this.layers.board.drawRoundedRect(0, 0, this.boardSize, this.boardSize, bRadius);
    this.layers.board.endFill();

    this.layers.cells.clear();
    var cellRadius = 7;
    var cellAlpha = 0.55;
    for (var r = 0; r < this.size; r++) {
      for (var c = 0; c < this.size; c++) {
        var x = this.gap + c * (this.cellSize + this.gap);
        var y = this.gap + r * (this.cellSize + this.gap);
        this.layers.cells.beginFill(0xcdc1b4, cellAlpha);
        this.layers.cells.drawRoundedRect(x, y, this.cellSize, this.cellSize, cellRadius);
        this.layers.cells.endFill();
      }
    }
  };

  Renderer.prototype.clearTiles = function clearTiles() {
    for (const tile of this.tiles.values()) {
      tile.container.destroy({ children: true });
    }
    this.tiles.clear();
    this.layers.tiles.removeChildren();
  };

  Renderer.prototype.createTile = function createTile(id, value, r, c) {
    const container = new window.PIXI.Container();
    const bg = new window.PIXI.Graphics();
    const text = new window.PIXI.Text("", {});
    text.anchor.set(0.5);

    container.addChild(bg);
    container.addChild(text);
    container.scale.set(1);

    const tile = { id, value, r, c, container, bg, text };
    this.redrawTile(tile);

    container.pivot.set(this.cellSize / 2, this.cellSize / 2);
    const pos = this.cellToCenter(r, c);
    container.position.set(pos.x, pos.y);

    this.layers.tiles.addChild(container);
    this.tiles.set(id, tile);

    return tile;
  };

  Renderer.prototype.redrawTile = function redrawTile(tile) {
    var radius = 7;
    var scale = Math.max(0.5, Math.min(1, this.boardSize / 500));
    var s = valueStyle(tile.value, scale);
    var w = this.cellSize;
    var h = this.cellSize;
    var g = tile.bg;

    g.clear();

    // single solid fill — Apple philosophy: one color, no bands
    g.beginFill(s.bg, 1);
    g.drawRoundedRect(0, 0, w, h, radius);
    g.endFill();

    // subtle top rim light — barely visible, soft depth
    g.lineStyle(1.5, 0xffffff, 0.12);
    g.drawRoundedRect(0.5, 0.5, w - 1, h - 1, radius);

    tile.text.text = String(tile.value);
    tile.text.style = new window.PIXI.TextStyle({
      fontFamily: '"Rubik", "Arial", "system-ui", "sans-serif"',
      fontWeight: "700",
      fontSize: s.size,
      fill: s.fg,
    });
    tile.text.position.set(w / 2, h / 2);
  };

  Renderer.prototype.tween = function tween(durationMs, update, easingFn) {
    if (!this.app || durationMs <= 0) {
      update(1);
      return Promise.resolve();
    }
    var ease = easingFn || cssEaseOut;
    return new Promise((resolve) => {
      const start = performance.now();
      const ticker = this.app.ticker;
      const tick = () => {
        const t = (performance.now() - start) / durationMs;
        if (t >= 1) {
          update(1);
          ticker.remove(tick);
          resolve();
          return;
        }
        update(ease(Math.max(0, Math.min(1, t))));
      };
      ticker.add(tick);
    });
  };

  Renderer.prototype.tweenMoveTo = function tweenMoveTo(tile, from, to, durationMs) {
    var fromP = this.cellToCenter(from.r, from.c);
    var toP = this.cellToCenter(to.r, to.c);

    return this.tween(durationMs, function (p) {
      tile.container.position.set(lerp(fromP.x, toP.x, p), lerp(fromP.y, toP.y, p));
    }, cssEaseOut);
  };

  Renderer.prototype.tweenMergeReveal = function tweenMergeReveal(tile, durationMs) {
    tile.text.scale.set(0);
    return this.tween(durationMs, function (p) {
      if (!tile.container || tile.container._destroyed) return;
      var peak = 1.15;
      var peakP = 0.4;
      var cs;
      if (p < peakP) {
        cs = lerp(1, peak, cssEase(p / peakP));
      } else {
        cs = lerp(peak, 1, cssEase((p - peakP) / (1 - peakP)));
      }
      tile.container.scale.set(cs);
      var tp = Math.max(0, (p - 0.05) / 0.95);
      tile.text.scale.set(lerp(0, 1, cssEase(tp)));
    }, cssEase).then(function () {
      if (!tile.container || tile.container._destroyed) return;
      tile.container.scale.set(1);
      tile.text.scale.set(1);
    });
  };

  Renderer.prototype.tweenAppear = function tweenAppear(tile, durationMs) {
    tile.container.scale.set(0);
    return this.tween(durationMs, function (p) {
      if (!tile.container || tile.container._destroyed) return;
      tile.container.scale.set(lerp(0, 1, p));
    }, cssEase).then(function () {
      if (!tile.container || tile.container._destroyed) return;
      tile.container.scale.set(1);
    });
  };

  Renderer.prototype.renderFull = function renderFull(state, best) {
    this.hideOverlay();
    this.clearTiles();
    for (const t of Object.values(state.tiles)) {
      this.createTile(t.id, t.value, t.r, t.c);
    }
    this.updateScore(state.score, best);
    this.updateStatus(state.reached2048);
  };

  Renderer.prototype.apply = function apply(state, best, events, scoreBefore, done) {
    this.hideOverlay();

    if (typeof scoreBefore === "number" && scoreBefore !== state.score) {
      this.animateScore(scoreBefore, state.score, best);
    } else {
      this.updateScore(state.score, best);
    }
    this.updateStatus(state.reached2048);

    var moveMs = parseCssMsVar("--move-ms", 80);
    var popMs = parseCssMsVar("--pop-ms", 120);
    var appearMs = parseCssMsVar("--appear-ms", 120);

    const toRemove = new Set(events.removes.map((r) => r.id));

    const movePromises = [];
    for (const mv of events.moves) {
      const tile = this.tiles.get(mv.id);
      if (!tile) continue;
      tile.r = mv.to.r;
      tile.c = mv.to.c;
      const p = this.tweenMoveTo(tile, mv.from, mv.to, moveMs).then(() => {
        if (toRemove.has(mv.id)) {
          tile.container.alpha = 0;
        }
      });
      movePromises.push(p);
    }

    const afterMoves = () => {
      const removeTile = (id) => {
        const tile = this.tiles.get(id);
        if (!tile) return;
        this.layers.tiles.removeChild(tile.container);
        tile.container.destroy({ children: true });
        this.tiles.delete(id);
      };

      for (const rm of events.removes) {
        removeTile(rm.id);
      }

      for (const mg of events.merges) {
        const into = this.tiles.get(mg.intoId);
        if (!into) continue;
        into.text.alpha = 0;
        into.value = mg.newValue;
        this.redrawTile(into);
        into.text.alpha = 1;
        this.tweenMergeReveal(into, popMs);
      }

      for (const sp of events.spawns) {
        const tile = this.createTile(sp.id, sp.value, sp.at.r, sp.at.c);
        this.tweenAppear(tile, appearMs);
      }

      if (done) done();
    };

    if (movePromises.length === 0) {
      afterMoves();
      return;
    }

    Promise.all(movePromises).then(afterMoves);
  };

  window.UIRenderer2048 = {
    create: function create(opts) {
      return new Renderer(opts);
    },
  };
})();

