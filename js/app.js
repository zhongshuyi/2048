(function () {
  function byId(id) {
    return document.getElementById(id);
  }

  function App() {
    this.best = 0;
    this.state = null;
    this.renderer = null;
    this.unbindInput = null;
    this.locked = false;
    this.pendingDirection = null;
    this.gridSize = 4;

    this.els = {
      board: byId("board"),
      stage: byId("stage"),
      overlay: byId("overlay"),
      overlayTitle: byId("overlayTitle"),
      statusText: byId("statusText"),
      scoreValue: byId("scoreValue"),
      bestValue: byId("bestValue"),
      newGameBtn: byId("newGameBtn"),
      tryAgainBtn: byId("tryAgainBtn"),
      gridSeg: document.querySelector(".grid-seg"),
    };
  }

  App.prototype.init = function init() {
    this.best = window.Storage2048 ? window.Storage2048.getBestScore() : 0;

    var size = this.gridSize;
    var created = window.Engine2048.createGame(size);
    this.state = created.state;

    this.renderer = window.UIRenderer2048.create({
      size: size,
      boardEl: this.els.board,
      stageEl: this.els.stage,
      overlayEl: this.els.overlay,
      overlayTitleEl: this.els.overlayTitle,
      statusEl: this.els.statusText,
      scoreEl: this.els.scoreValue,
      bestEl: this.els.bestValue,
    });
    this.renderer.init();
    this.renderer.renderFull(this.state, this.best);

    this.bindActions();
    this.bindInput();
    this.bindGridSelector();
    this.syncGridPill();
  };

  App.prototype.bindActions = function bindActions() {
    this.els.newGameBtn.addEventListener("click", () => this.reset());
    this.els.tryAgainBtn.addEventListener("click", () => this.reset());
  };

  App.prototype.bindInput = function bindInput() {
    if (!window.Input2048) return;
    this.unbindInput = window.Input2048.bindInput({
      element: this.els.board,
      onMove: (dir) => this.tryMove(dir),
    });
  };

  App.prototype.reset = function reset() {
    this.locked = false;
    this.pendingDirection = null;
    var created = window.Engine2048.createGame(this.gridSize);
    this.state = created.state;
    this.renderer.renderFull(this.state, this.best);
  };

  App.prototype.changeGridSize = function changeGridSize(newSize) {
    if (newSize === this.gridSize) return;
    this.gridSize = newSize;
    this.locked = false;
    this.pendingDirection = null;
    var created = window.Engine2048.createGame(newSize);
    this.state = created.state;
    this.renderer.setSize(newSize);
    this.renderer.renderFull(this.state, this.best);
    this.syncGridPill();
  };

  App.prototype.syncGridPill = function syncGridPill() {
    if (!this.els.gridSeg) return;
    var seg = this.els.gridSeg;
    var idx = this.gridSize - 4;
    var checked = seg.querySelector('input:checked');
    if (!checked) return;
    var label = checked.closest('label') || checked.nextElementSibling;
    seg.setAttribute("data-active", String(idx));
    // JS-measured pill position for pixel-perfect alignment
    var pill = seg.querySelector(".grid-seg-pill");
    if (pill && label) {
      var segRect = seg.getBoundingClientRect();
      var labelRect = label.getBoundingClientRect();
      var left = labelRect.left - segRect.left;
      var width = labelRect.width;
      pill.style.width = width + "px";
      pill.style.transform = "translateX(" + left + "px)";
    }
  };

  App.prototype.bindGridSelector = function bindGridSelector() {
    if (!this.els.gridSeg) return;
    var self = this;
    var radios = this.els.gridSeg.querySelectorAll('input[name="gridSize"]');
    for (var i = 0; i < radios.length; i++) {
      radios[i].addEventListener("change", function () {
        var v = parseInt(this.value, 10);
        if (v > 0) self.changeGridSize(v);
      });
    }
    window.addEventListener("resize", function () { self.syncGridPill(); });
  };

  App.prototype.tryMove = function tryMove(direction) {
    if (this.locked) {
      this.pendingDirection = direction;
      return;
    }
    if (!this.state) return;

    const result = window.Engine2048.move(this.state, direction);
    if (!result.moved) {
      if (result.gameOver) {
        this.renderer.showOverlay("Game over!");
      }
      return;
    }

    var scoreBefore = this.state ? this.state.score : 0;
    this.state = result.state;
    if (this.state.score > this.best) {
      this.best = this.state.score;
      if (window.Storage2048) window.Storage2048.setBestScore(this.best);
    }

    this.locked = true;
    this.renderer.apply(this.state, this.best, result.events, scoreBefore, () => {
      this.locked = false;
      if (result.gameOver) {
        this.renderer.showOverlay("Game over!");
      }
      if (this.pendingDirection) {
        const next = this.pendingDirection;
        this.pendingDirection = null;
        this.tryMove(next);
      }
    });
  };

  function boot() {
    const app = new App();
    app.init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

