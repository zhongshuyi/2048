(function () {
  function clampInt(n) {
    if (typeof n !== "number") return 0;
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
  }

  // ======== Spring Physics Engine ========
  // Replaces cubic-bezier LUT with real damped harmonic oscillator.
  // Semi-implicit Euler integration, stable at 60fps.

  function createSpring(config) {
    var p = config.from != null ? config.from : 0;
    var v = config.velocity || 0;
    var target = config.to != null ? config.to : 1;
    var k = config.stiffness || 180;
    var c = config.damping || 18;
    var m = config.mass || 1;
    var threshold = config.precision || 0.0005;
    var settled = false;

    return function (dt) {
      if (settled) return target;
      // Cap dt for stability after tab-away / visibility change
      if (dt > 0.05) dt = 0.016;

      var f = -k * (p - target) - c * v;
      var a = f / m;
      v += a * dt;
      p += v * dt;

      if (Math.abs(v) < threshold && Math.abs(p - target) < threshold) {
        p = target;
        v = 0;
        settled = true;
      }
      return p;
    };
  }

  // Pre-configured spring profiles for different animation types
  var SPRING_MERGE = { stiffness: 1200, damping: 40 };
  var SPRING_APPEAR = { stiffness: 900, damping: 34 };
  var SPRING_MOVE = { stiffness: 900, damping: 32 };

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

  function valueStyle(value, boardScale, gridSize) {
    var bs = typeof boardScale === "number" && Number.isFinite(boardScale) ? boardScale : 1;
    var gs = typeof gridSize === "number" && gridSize > 0 ? gridSize : 4;
    var cellScale = 4 / gs;
    var s = Math.max(0.3, bs * cellScale);
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
    var duration = 200;
    var start = performance.now();
    var ticker = this.app.ticker;

    var spring = createSpring({
      from: 0, to: 1,
      stiffness: 600, damping: 42,
      velocity: 0,
    });
    var lastTime = start;

    function tick() {
      var now = performance.now();
      var elapsed = now - start;
      var dt = (now - lastTime) / 1000;
      lastTime = now;

      if (elapsed >= duration) {
        self.scoreEl.textContent = String(clampInt(toVal));
        ticker.remove(tick);
        return;
      }

      var sv = spring(dt);
      var current = Math.round(lerp(fromVal, toVal, Math.min(1, sv)));
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
    var cssGap = parseCssPxVar("--gap", 15);
    var calcGap = Math.max(5, Math.min(15, Math.floor(this.boardSize / (this.size * 7))));
    this.gap = Math.min(cssGap, calcGap);
    this.cellSize = (this.boardSize - this.gap * (this.size + 1)) / this.size;
  };

  Renderer.prototype.setSize = function setSize(newSize) {
    this.size = newSize;
    this.measure();
    this.drawStatic();
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

    this.handleResize = function () { this.resize(); }.bind(this);
    window.addEventListener("resize", this.handleResize);
    this.handleOrientation = function () {
      window.setTimeout(function () { this.resize(); }.bind(this), 60);
    }.bind(this);
    window.addEventListener("orientationchange", this.handleOrientation);
  };

  Renderer.prototype.destroy = function destroy() {
    if (this.handleResize) {
      window.removeEventListener("resize", this.handleResize);
      this.handleResize = null;
    }
    if (this.handleOrientation) {
      window.removeEventListener("orientationchange", this.handleOrientation);
      this.handleOrientation = null;
    }
    if (this.app) {
      this.app.destroy(true, { children: true });
      this.app = null;
    }
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
    var cellRadius = Math.max(3, Math.min(10, Math.round(this.cellSize * 0.08)));
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

    const tile = { id, value, r, c, container, bg, text, _animating: false };
    this.redrawTile(tile);

    container.pivot.set(this.cellSize / 2, this.cellSize / 2);
    const pos = this.cellToCenter(r, c);
    container.position.set(pos.x, pos.y);

    this.layers.tiles.addChild(container);
    this.tiles.set(id, tile);

    return tile;
  };

  Renderer.prototype.redrawTile = function redrawTile(tile) {
    var radius = Math.max(3, Math.min(10, Math.round(this.cellSize * 0.08)));
    var scale = Math.max(0.5, Math.min(1, this.boardSize / 500));
    var s = valueStyle(tile.value, scale, this.size);
    var w = this.cellSize;
    var h = this.cellSize;
    var g = tile.bg;

    g.clear();

    g.beginFill(s.bg, 1);
    g.drawRoundedRect(0, 0, w, h, radius);
    g.endFill();

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

  // ======== Tween engine ========

  // Standard linear-progress tween (for non-spring use)
  Renderer.prototype.tween = function tween(durationMs, update) {
    if (!this.app || durationMs <= 0) {
      update(1);
      return Promise.resolve();
    }
    var self = this;
    return new Promise(function (resolve) {
      var start = performance.now();
      var ticker = self.app.ticker;
      var tick = function () {
        var t = (performance.now() - start) / durationMs;
        if (t >= 1) {
          update(1);
          ticker.remove(tick);
          resolve();
          return;
        }
        update(Math.max(0, Math.min(1, t)));
      };
      ticker.add(tick);
    });
  };

  // Spring-driven tween: update receives raw spring value (may overshoot beyond [0,1])
  Renderer.prototype.springTween = function springTween(durationMs, update, springConfig) {
    if (!this.app || durationMs <= 0) {
      update(1);
      return Promise.resolve();
    }
    var self = this;
    var cfg = springConfig || {};
    var spring = createSpring({
      from: cfg.from != null ? cfg.from : 0,
      to: cfg.to != null ? cfg.to : 1,
      velocity: cfg.velocity || 0,
      stiffness: cfg.stiffness || 180,
      damping: cfg.damping || 18,
    });

    return new Promise(function (resolve) {
      var start = performance.now();
      var lastTime = start;
      var ticker = self.app.ticker;
      var tick = function () {
        var now = performance.now();
        var elapsed = now - start;
        var dt = (now - lastTime) / 1000;
        lastTime = now;

        var value = spring(dt);
        update(value);

        // Resolve as soon as minimum time has passed and spring is close enough
        if (elapsed >= durationMs && Math.abs(value - (cfg.to != null ? cfg.to : 1)) < 0.03) {
          update(cfg.to != null ? cfg.to : 1);
          ticker.remove(tick);
          resolve();
          return;
        }

        // Hard deadline
        if (elapsed >= durationMs * 1.5) {
          update(cfg.to != null ? cfg.to : 1);
          ticker.remove(tick);
          resolve();
        }
      };
      ticker.add(tick);
    });
  };

  // ======== Tile animations ========

  Renderer.prototype.tweenMoveTo = function tweenMoveTo(tile, from, to, durationMs) {
    var self = this;
    var fromP = this.cellToCenter(from.r, from.c);
    var toP = this.cellToCenter(to.r, to.c);

    tile._animating = true;

    return this.springTween(durationMs, function (value) {
      tile.container.position.set(
        lerp(fromP.x, toP.x, value),
        lerp(fromP.y, toP.y, value)
      );
    }, {
      from: 0, to: 1,
      stiffness: SPRING_MOVE.stiffness,
      damping: SPRING_MOVE.damping,
    }).then(function () {
      tile._animating = false;
    });
  };

  // Multi-phase merge reveal using spring physics:
  // Phase 1: shrink (1 → 0.82) — tight spring, slight undershoot
  // Phase 2: pop   (0.82 → overshoot → settle at 1) — looser spring with bounce
  Renderer.prototype.tweenMergeReveal = function tweenMergeReveal(tile, durationMs) {
    var self = this;
    var shrinkMs = durationMs * 0.35;
    var popMs = durationMs * 0.65;

    tile._animating = true;

    return self.springTween(shrinkMs, function (value) {
      if (!tile.container || tile.container._destroyed) return;
      tile.container.scale.set(value);
    }, {
      from: 1, to: 0.75,
      stiffness: 1200, damping: 54,
    }).then(function () {
      if (!tile.container || tile.container._destroyed) return;

      return self.springTween(popMs, function (value) {
        if (!tile.container || tile.container._destroyed) return;
        tile.container.scale.set(value);
      }, {
        from: 0.75, to: 1,
        stiffness: 1600, damping: 40,
      });
    }).then(function () {
      if (!tile.container || tile.container._destroyed) return;
      tile.container.scale.set(1);
      tile._animating = false;
    });
  };

  // Spring-driven appear: scale from 0 with initial velocity for anticipation feel
  Renderer.prototype.tweenAppear = function tweenAppear(tile, durationMs) {
    var self = this;
    tile.container.scale.set(0);
    tile._animating = true;

    return self.springTween(durationMs, function (value) {
      if (!tile.container || tile.container._destroyed) return;
      tile.container.scale.set(value);
    }, {
      from: 0, to: 1,
      stiffness: SPRING_APPEAR.stiffness,
      damping: SPRING_APPEAR.damping,
      velocity: 3.0,
    }).then(function () {
      if (!tile.container || tile.container._destroyed) return;
      tile.container.scale.set(1);
      tile._animating = false;
    });
  };

  // ======== Full render & apply ========

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
    var self = this;
    this.hideOverlay();

    if (typeof scoreBefore === "number" && scoreBefore !== state.score) {
      this.animateScore(scoreBefore, state.score, best);
    } else {
      this.updateScore(state.score, best);
    }
    this.updateStatus(state.reached2048);

    // Longer defaults for spring-driven animations
    var moveMs = parseCssMsVar("--move-ms", 80);
    var popMs = parseCssMsVar("--pop-ms", 130);
    var appearMs = parseCssMsVar("--appear-ms", 100);

    const toRemove = new Set(events.removes.map(function (r) { return r.id; }));

    // Hide merge-target tiles during move
    for (var mi = 0; mi < events.merges.length; mi++) {
      var mg = events.merges[mi];
      var into = this.tiles.get(mg.intoId);
      if (!into) continue;
      into.text.alpha = 0;
      into.text.scale.set(0);
    }

    // Move phase
    var movePromises = [];
    for (var mvi = 0; mvi < events.moves.length; mvi++) {
      var mv = events.moves[mvi];
      var tile = this.tiles.get(mv.id);
      if (!tile) continue;
      tile.r = mv.to.r;
      tile.c = mv.to.c;
      (function (t, mvId) {
        var p = self.tweenMoveTo(t, mv.from, mv.to, moveMs).then(function () {
          if (toRemove.has(mvId)) {
            t.container.alpha = 0;
          }
        });
        movePromises.push(p);
      })(tile, mv.id);
    }

    var afterMoves = function () {
      var removeTile = function (id) {
        var tile = self.tiles.get(id);
        if (!tile) return;
        self.layers.tiles.removeChild(tile.container);
        tile.container.destroy({ children: true });
        self.tiles.delete(id);
      };

      for (var ri = 0; ri < events.removes.length; ri++) {
        removeTile(events.removes[ri].id);
      }

      for (var mgi = 0; mgi < events.merges.length; mgi++) {
        var mg2 = events.merges[mgi];
        var into2 = self.tiles.get(mg2.intoId);
        if (!into2) continue;
        into2.container.scale.set(1);
        into2.value = mg2.newValue;
        self.redrawTile(into2);
        into2.text.alpha = 1;
        into2.text.scale.set(1);
        self.tweenMergeReveal(into2, popMs);
      }

      for (var si = 0; si < events.spawns.length; si++) {
        var sp = events.spawns[si];
        var newTile = self.createTile(sp.id, sp.value, sp.at.r, sp.at.c);
        self.tweenAppear(newTile, appearMs);
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
