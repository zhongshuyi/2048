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
    };
  }

  App.prototype.init = function init() {
    this.best = window.Storage2048 ? window.Storage2048.getBestScore() : 0;

    const created = window.Engine2048.createGame(4);
    this.state = created.state;

    this.renderer = window.UIRenderer2048.create({
      size: 4,
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
    const created = window.Engine2048.createGame(4);
    this.state = created.state;
    this.renderer.renderFull(this.state, this.best);
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

