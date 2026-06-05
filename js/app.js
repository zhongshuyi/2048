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
    this.tab = "solo";
    this.battle = null;
    this.inBattle = false;

    this.config = {
      room: { mode: "timed", time: 180, grid: 4 },
      match: { mode: "timed", time: 180, grid: 4 },
    };

    this.els = {
      board: byId("board"),
      stage: byId("stage"),
      overlay: byId("overlay"),
      overlayTitle: byId("overlayTitle"),
      overlayScores: byId("overlayScores"),
      overlayActions: byId("overlayActions"),
      overlayBattleActions: byId("overlayBattleActions"),
      statusText: byId("statusText"),
      scoreValue: byId("scoreValue"),
      bestValue: byId("bestValue"),
      newGameBtn: byId("newGameBtn"),
      tryAgainBtn: byId("tryAgainBtn"),
      rematchBtn: byId("rematchBtn"),
      backToMenuBtn: byId("backToMenuBtn"),
      gridSeg: document.querySelector(".grid-seg"),
      nickBar: byId("nickBar"),
      nickInput: byId("nickInput"),
      lobbyTabs: byId("lobbyTabs"),
      panelSolo: byId("panelSolo"),
      panelRoom: byId("panelRoom"),
      panelMatch: byId("panelMatch"),
      battleHeader: byId("battleHeader"),
      joinBar: byId("joinBar"),
      joinCodeInput: byId("joinCodeInput"),
      joinBtn: byId("joinBtn"),
      joinCancelBtn: byId("joinCancelBtn"),
      createRoomBtn: byId("createRoomBtn"),
      roomCodeDisplay: byId("roomCodeDisplay"),
      roomCodeText: byId("roomCodeText"),
      matchBtn: byId("matchBtn"),
      matchStatus: byId("matchStatus"),
      myName: byId("myName"),
      myScore: byId("myScore"),
      oppBoardWrap: byId("oppBoardWrap"),
    };
  }

  App.prototype.init = function init() {
    var self = this;
    this.best = window.Storage2048 ? window.Storage2048.getBestScore() : 0;

    this.renderer = window.UIRenderer2048.create({
      size: this.gridSize,
      boardEl: this.els.board,
      stageEl: this.els.stage,
      overlayEl: this.els.overlay,
      overlayTitleEl: this.els.overlayTitle,
      statusEl: this.els.statusText,
      scoreEl: this.els.scoreValue,
      bestEl: this.els.bestValue,
    });
    this.renderer.init();

    if (window.BattleClient) {
      this.battle = new window.BattleClient();
      this.battle.init(this);
    }

    this.startSolo();
    this.bindActions();
    this.bindLobbyTabs();
    this.bindConfigButtons();
    this.bindNickname();

    var params = new URLSearchParams(window.location.search);
    var roomCode = params.get("room");
    if (roomCode && this.battle) {
      this.switchTab("match");
      this.els.joinBar.classList.remove("hidden");
      this.els.joinCodeInput.value = roomCode.toUpperCase();
      var self2 = this;
      setTimeout(function () {
        self2.doJoinRoom(roomCode);
      }, 500);
    }
  };

  App.prototype.bindNickname = function () {
    var self = this;
    var input = this.els.nickInput;
    if (!input) return;
    var stored = window.Storage2048 ? window.Storage2048.getNickname() : null;
    input.value = stored || (window.Storage2048 ? window.Storage2048.randomNickname() : "Player");
    input.addEventListener("change", function () {
      if (window.Storage2048) {
        window.Storage2048.setNickname(input.value.trim());
      }
      if (self.battle) {
        self.battle.nickname = input.value.trim();
      }
    });
    if (this.battle) {
      this.battle.nickname = input.value.trim();
    }
  };

  App.prototype.bindLobbyTabs = function () {
    var self = this;
    if (!this.els.lobbyTabs) return;
    this.els.lobbyTabs.addEventListener("click", function (e) {
      var tab = e.target.closest(".lobby-tab");
      if (!tab) return;
      var name = tab.dataset.tab;
      if (name) self.switchTab(name);
    });
  };

  App.prototype.switchTab = function (name) {
    this.tab = name;
    var tabs = this.els.lobbyTabs.querySelectorAll(".lobby-tab");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle("active", tabs[i].dataset.tab === name);
    }

    this.els.panelSolo.classList.toggle("hidden", name !== "solo");
    this.els.panelRoom.classList.toggle("hidden", name !== "room");
    this.els.panelMatch.classList.toggle("hidden", name !== "match");

    this.els.gridSeg.style.display = name === "solo" ? "" : "none";
    this.els.nickBar.style.display = "";

    this.els.battleHeader.classList.add("hidden");
    this.els.oppBoardWrap.classList.add("hidden");
    this.els.joinBar.classList.add("hidden");
    this.els.roomCodeDisplay.hidden = true;
    this.els.matchStatus.classList.add("hidden");

    if (name === "solo") {
      this.ensureSoloGame();
    } else if (name === "match") {
      this.els.joinBar.classList.remove("hidden");
    }
  };

  App.prototype.ensureSoloGame = function () {
    if (this.inBattle) {
      this.exitBattle();
    }
    if (!this.state) {
      var created = window.Engine2048.createGame(this.gridSize);
      this.state = created.state;
      this.renderer.renderFull(this.state, this.best);
    }
  };

  App.prototype.bindConfigButtons = function () {
    var self = this;
    document.addEventListener("click", function (e) {
      var btn = e.target.closest(".seg-btn");
      if (!btn) return;
      var key = btn.dataset.key;
      var val = btn.dataset.val;
      var row = btn.parentNode;
      var siblings = row.querySelectorAll(".seg-btn");
      for (var i = 0; i < siblings.length; i++) {
        siblings[i].classList.remove("active");
      }
      btn.classList.add("active");

      var tabKey = self.tab === "match" ? "match" : "room";
      if (key === "mode") {
        self.config[tabKey].mode = val;
        var rowTimeId = tabKey === "match" ? "rowMatchTime" : "rowTime";
        var rowTime = byId(rowTimeId);
        if (rowTime) {
          rowTime.style.display = val === "timed" ? "" : "none";
        }
      } else if (key === "time") {
        self.config[tabKey].time = parseInt(val, 10);
      } else if (key === "grid") {
        self.config[tabKey].grid = parseInt(val, 10);
      }
    });
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

  App.prototype.bindActions = function bindActions() {
    var self = this;
    this.els.newGameBtn.addEventListener("click", function () { self.reset(); });
    this.els.tryAgainBtn.addEventListener("click", function () {
      if (self.inBattle && self.battle) {
        self.battle.sendRematch();
        return;
      }
      self.reset();
    });
    if (this.els.rematchBtn) {
      this.els.rematchBtn.addEventListener("click", function () {
        if (self.battle) self.battle.sendRematch();
      });
    }
    if (this.els.backToMenuBtn) {
      this.els.backToMenuBtn.addEventListener("click", function () {
        self.exitBattle();
        self.switchTab("solo");
      });
    }
    if (this.els.createRoomBtn) {
      this.els.createRoomBtn.addEventListener("click", function () {
        self.doCreateRoom();
      });
    }
    if (this.els.matchBtn) {
      this.els.matchBtn.addEventListener("click", function () {
        self.doMatch();
      });
    }
    if (this.els.joinBtn) {
      this.els.joinBtn.addEventListener("click", function () {
        var code = self.els.joinCodeInput.value.trim().toUpperCase();
        if (code) self.doJoinRoom(code);
      });
    }
    if (this.els.joinCancelBtn) {
      this.els.joinCancelBtn.addEventListener("click", function () {
        self.els.joinBar.classList.add("hidden");
        self.els.joinCodeInput.value = "";
      });
    }
  };

  App.prototype.doCreateRoom = function () {
    if (!this.battle) return;
    var cfg = this.config.room;
    var timeLimit = cfg.mode === "timed" ? cfg.time : null;
    this.battle.createRoom(cfg.mode, cfg.grid, timeLimit);
    this.els.roomCodeDisplay.hidden = true;
  };

  App.prototype.doMatch = function () {
    if (!this.battle) return;
    var cfg = this.config.match;
    var timeLimit = cfg.mode === "timed" ? cfg.time : null;
    this.battle.joinMatch(cfg.mode, cfg.grid, timeLimit);
    this.els.matchStatus.classList.remove("hidden");
    this.els.matchBtn.disabled = true;
    this.els.joinBar.classList.add("hidden");
  };

  App.prototype.doJoinRoom = function (code) {
    if (!this.battle) return;
    this.battle.joinRoom(code);
    this.els.matchStatus.classList.remove("hidden");
    this.els.matchStatus.textContent = "正在加入房间 " + code + "...";
    this.els.joinBar.classList.add("hidden");
  };

  App.prototype.onWaiting = function (msg) {
    if (msg.room_code) {
      this.els.roomCodeDisplay.hidden = false;
      this.els.roomCodeText.textContent = msg.room_code;
      this.els.createRoomBtn.disabled = true;
      this.els.matchStatus.classList.remove("hidden");
      this.els.matchStatus.textContent = "等待对手加入...";
    }
  };

  App.prototype.onBattleStart = function (msg) {
    var self = this;
    this.inBattle = true;

    this.els.panelSolo.classList.add("hidden");
    this.els.panelRoom.classList.add("hidden");
    this.els.panelMatch.classList.add("hidden");
    this.els.gridSeg.style.display = "none";
    this.els.roomCodeDisplay.hidden = true;
    this.els.matchStatus.classList.add("hidden");
    this.els.joinBar.classList.add("hidden");
    this.els.lobbyTabs.style.display = "none";

    this.els.battleHeader.classList.remove("hidden");
    this.els.oppBoardWrap.classList.remove("hidden");
    this.els.myName.textContent = this.battle.nickname;
    this.els.myScore.textContent = "0";

    this.gridSize = msg.gridSize;
    this.renderer.setSize(msg.gridSize);

    var boardState = msg.your_board;
    this.state = {
      size: boardState.size,
      score: boardState.score,
      reached2048: boardState.reached2048 || false,
      nextId: this.findMaxId(boardState.tiles) + 1,
      grid: boardState.grid,
      tiles: boardState.tiles,
    };
    this.renderer.renderFull(this.state, this.best);
    this.renderer.hideOverlay();

    this.battle.opponentNickname = msg.opponent_nickname;
    this.battle.renderOpponentMini(msg.opponent_board.grid, msg.gridSize);

    if (msg.mode === "timed" && msg.time) {
      this.battle.startTimer(msg.time, true);
    } else {
      this.battle.startTimer(0, false);
    }

    this.locked = false;
    this.pendingDirection = null;
    this.bindInput();
  };

  App.prototype.onOpponentMove = function (msg) {
    if (this.battle) {
      this.battle.renderOpponentMini(msg.grid, this.gridSize);
      this.battle.renderOpponentScore(msg.score);
    }
  };

  App.prototype.onGameOver = function (msg) {
    this.battle.stopTimer();
    this.locked = true;

    var title;
    if (msg.winner === "you") {
      title = "YOU WIN!";
    } else if (msg.winner === "opponent") {
      title = "YOU LOSE!";
    } else {
      title = "DRAW!";
    }

    this.els.overlayTitle.textContent = title;
    this.els.overlayScores.hidden = false;
    this.els.overlayScores.textContent =
      this.battle.nickname + " " + msg.your_score + " — " +
      this.battle.opponentNickname + " " + msg.opponent_score;
    this.els.overlayActions.classList.add("hidden");
    this.els.overlayBattleActions.classList.remove("hidden");
    this.els.overlay.hidden = false;
  };

  App.prototype.exitBattle = function () {
    this.inBattle = false;
    if (this.battle) {
      this.battle.cancel();
      this.battle.stopTimer();
    }
    this.locked = false;
    this.pendingDirection = null;
    this.els.battleHeader.classList.add("hidden");
    this.els.oppBoardWrap.classList.add("hidden");
    this.els.joinBar.classList.add("hidden");
    this.els.lobbyTabs.style.display = "";
    this.els.gridSeg.style.display = "";
    this.els.overlayScores.hidden = true;
    this.els.overlayBattleActions.classList.add("hidden");
    this.els.overlayActions.classList.remove("hidden");
    this.els.roomCodeDisplay.hidden = true;
    this.els.matchStatus.classList.add("hidden");
    this.els.matchBtn.disabled = false;
    this.els.createRoomBtn.disabled = false;
    this.renderer.hideOverlay();
    this.state = null;
  };

  App.prototype.findMaxId = function (tiles) {
    var max = 0;
    for (var key in tiles) {
      if (tiles.hasOwnProperty(key)) {
        var n = parseInt(key, 10);
        if (n > max) max = n;
      }
    }
    return max;
  };

  App.prototype.bindInput = function bindInput() {
    if (!window.Input2048) return;
    if (this.unbindInput) {
      this.unbindInput();
      this.unbindInput = null;
    }
    var self = this;
    this.unbindInput = window.Input2048.bindInput({
      element: this.els.board,
      onMove: function (dir) { self.tryMove(dir); },
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

  App.prototype.startSolo = function () {
    var created = window.Engine2048.createGame(this.gridSize);
    this.state = created.state;
    this.renderer.renderFull(this.state, this.best);
    this.bindInput();
    this.bindGridSelector();
    this.syncGridPill();
  };

  App.prototype.tryMove = function tryMove(direction) {
    if (this.locked) {
      this.pendingDirection = direction;
      return;
    }
    if (!this.state) return;

    var result = window.Engine2048.move(this.state, direction);
    if (!result.moved) {
      if (result.gameOver && !this.inBattle) {
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

    if (this.inBattle && this.battle) {
      this.battle.sendMove(direction);
    }

    this.locked = true;
    var self = this;
    this.renderer.apply(this.state, this.best, result.events, scoreBefore, function () {
      self.locked = false;

      if (self.inBattle && self.els.myScore) {
        self.els.myScore.textContent = String(self.state.score);
      }

      if (result.gameOver) {
        if (!self.inBattle) {
          self.renderer.showOverlay("Game over!");
        }
      }
      if (self.pendingDirection) {
        var next = self.pendingDirection;
        self.pendingDirection = null;
        self.tryMove(next);
      }
    });
  };

  function boot() {
    var app = new App();
    app.init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
