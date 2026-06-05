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
    this.mode = "solo";  // solo | waiting | playing

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
      panelJoin: byId("panelJoin"),
      panelWaiting: byId("panelWaiting"),
      waitingTitle: byId("waitingTitle"),
      waitingCode: byId("waitingCode"),
      waitingCodeText: byId("waitingCodeText"),
      waitingInfo: byId("waitingInfo"),
      cancelWaitBtn: byId("cancelWaitBtn"),
      battleHeader: byId("battleHeader"),
      joinInput: byId("joinInput"),
      joinRoomBtn: byId("joinRoomBtn"),
      createRoomBtn: byId("createRoomBtn"),
      matchBtn: byId("matchBtn"),
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
    this.setMode("solo");

    var params = new URLSearchParams(window.location.search);
    var roomCode = params.get("room");
    if (roomCode && this.battle) {
      this.switchTab("join");
      this.els.joinInput.value = roomCode.toUpperCase();
      var self2 = this;
      setTimeout(function () {
        self2.doJoinRoom(roomCode);
      }, 500);
    }
  };

  // ── Mode controller ──

  App.prototype.setMode = function (m) {
    this.mode = m;
    var locked = m !== "solo";
    var playing = m === "playing";
    var waiting = m === "waiting";
    var solo = m === "solo";

    // Tabs: locked when not solo, hidden during playing
    var tabs = this.els.lobbyTabs.querySelectorAll(".lobby-tab");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle("disabled", locked);
    }
    this.els.lobbyTabs.classList.toggle("hidden", playing);
    this.els.newGameBtn.classList.toggle("disabled", locked);
    if (locked) this.els.newGameBtn.setAttribute("disabled", "");
    else this.els.newGameBtn.removeAttribute("disabled");

    // Config panels: only in solo mode, matching tab
    this.els.panelSolo.classList.toggle("hidden", !solo || this.tab !== "solo");
    this.els.panelRoom.classList.toggle("hidden", !solo || this.tab !== "room");
    this.els.panelMatch.classList.toggle("hidden", !solo || this.tab !== "match");
    this.els.panelJoin.classList.toggle("hidden", !solo || this.tab !== "join");

    // Waiting panel: only during waiting
    this.els.panelWaiting.classList.toggle("hidden", !waiting);

    // Grid selector: only in solo mode on solo tab
    this.els.gridSeg.style.display = (solo && this.tab === "solo") ? "" : "none";

    // Battle header + opponent: only during playing
    this.els.battleHeader.classList.toggle("hidden", !playing);
    this.els.oppBoardWrap.classList.toggle("hidden", !playing);

    // Board: show only in solo (solo tab) or playing
    var showBoard = (solo && this.tab === "solo") || playing;
    this.els.board.style.display = showBoard ? "" : "none";
    this.els.stage.style.display = showBoard ? "" : "none";
    this.els.statusText.style.display = showBoard ? "" : "none";
  };

  // ── Nickname ──

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

  // ── Lobby tabs ──

  App.prototype.bindLobbyTabs = function () {
    var self = this;
    if (!this.els.lobbyTabs) return;
    this.els.lobbyTabs.addEventListener("click", function (e) {
      if (self.mode !== "solo") return;
      var tab = e.target.closest(".lobby-tab");
      if (!tab || tab.classList.contains("disabled")) return;
      var name = tab.dataset.tab;
      if (name) self.switchTab(name);
    });
  };

  App.prototype.switchTab = function (name) {
    if (this.mode !== "solo") return;
    this.tab = name;
    var tabs = this.els.lobbyTabs.querySelectorAll(".lobby-tab");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle("active", tabs[i].dataset.tab === name);
    }
    if (name === "solo") {
      this.ensureSoloGame();
    } else {
      this.enterLobby();
    }
    this.setMode("solo");
  };

  App.prototype.enterLobby = function () {
    if (this.renderer) {
      this.renderer.clearTiles();
    }
    this.state = null;
    this.unbindKeyboard();
    this.renderer.hideOverlay();
  };

  App.prototype.ensureSoloGame = function () {
    if (!this.state) {
      var created = window.Engine2048.createGame(this.gridSize);
      this.state = created.state;
      this.renderer.renderFull(this.state, this.best);
    }
  };

  // ── Config buttons ──

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
        if (rowTime) rowTime.style.display = val === "timed" ? "" : "none";
      } else if (key === "time") {
        self.config[tabKey].time = parseInt(val, 10);
      } else if (key === "grid") {
        self.config[tabKey].grid = parseInt(val, 10);
      }
    });
  };

  // ── Grid selector ──

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

  // ── Actions ──

  App.prototype.bindActions = function bindActions() {
    var self = this;
    this.els.newGameBtn.addEventListener("click", function () {
      if (self.mode !== "solo") return;
      self.reset();
    });
    this.els.tryAgainBtn.addEventListener("click", function () {
      if (self.mode === "playing" && self.battle) {
        self.battle.sendRematch();
        self.els.rematchBtn.textContent = "等待对手...";
        self.els.rematchBtn.disabled = true;
        self.els.rematchBtn.classList.add("disabled");
        return;
      }
      self.reset();
    });
    if (this.els.rematchBtn) {
      this.els.rematchBtn.addEventListener("click", function () {
        if (self.battle) self.battle.sendRematch();
        // Show waiting feedback
        self.els.rematchBtn.textContent = "等待对手...";
        self.els.rematchBtn.disabled = true;
        self.els.rematchBtn.classList.add("disabled");
      });
    }
    if (this.els.backToMenuBtn) {
      this.els.backToMenuBtn.addEventListener("click", function () {
        self.exitBattle();
      });
    }
    if (this.els.createRoomBtn) {
      this.els.createRoomBtn.addEventListener("click", function () { self.doCreateRoom(); });
    }
    if (this.els.matchBtn) {
      this.els.matchBtn.addEventListener("click", function () { self.doMatch(); });
    }
    if (this.els.cancelWaitBtn) {
      this.els.cancelWaitBtn.addEventListener("click", function () { self.cancelWaiting(); });
    }
    if (this.els.joinRoomBtn) {
      this.els.joinRoomBtn.addEventListener("click", function () {
        var code = self.els.joinInput.value.trim().toUpperCase();
        if (code && code.length === 6) self.doJoinRoom(code);
      });
      // Also allow Enter key in the join input
      this.els.joinInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          var code = self.els.joinInput.value.trim().toUpperCase();
          if (code && code.length === 6) self.doJoinRoom(code);
        }
      });
    }
  };

  // ── Battle actions ──

  App.prototype.doCreateRoom = function () {
    if (!this.battle || this.mode !== "solo") return;
    var cfg = this.config.room;
    var timeLimit = cfg.mode === "timed" ? cfg.time : null;
    this.battle.createRoom(cfg.mode, cfg.grid, timeLimit);
    this.showWaiting("创建房间", cfg.mode, cfg.grid, cfg.time);
    this.enterLobby();
    this.setMode("waiting");
  };

  App.prototype.doMatch = function () {
    if (!this.battle || this.mode !== "solo") return;
    var cfg = this.config.match;
    var timeLimit = cfg.mode === "timed" ? cfg.time : null;
    this.battle.joinMatch(cfg.mode, cfg.grid, timeLimit);
    this.showWaiting("快速匹配", cfg.mode, cfg.grid, cfg.time);
    this.enterLobby();
    this.setMode("waiting");
  };

  App.prototype.doJoinRoom = function (code) {
    if (!this.battle || this.mode !== "solo") return;
    this.battle.joinRoom(code);
    // Config unknown — server will tell us on start
    this.showWaiting("加入房间", null, null, null);
    this.els.waitingTitle.textContent = "正在加入房间 " + code + "...";
    this.enterLobby();
    this.setMode("waiting");
  };

  App.prototype.showWaiting = function (action, mode, grid, time) {
    this.els.waitingTitle.textContent = action === "创建房间" ? "等待对手加入..." : "正在寻找对手...";
    this.els.waitingCode.hidden = true;
    // Info: mode + time + grid
    var parts = [];
    if (mode) {
      var modeLabel = mode === "timed" ? "计时赛" : "竞速赛";
      parts.push(modeLabel);
    }
    if (grid) parts.push(grid + "×" + grid);
    if (mode === "timed" && time) {
      var mins = Math.floor(time / 60);
      parts.push(mins + " 分钟");
    }
    this.els.waitingInfo.textContent = parts.join(" · ");
  };

  App.prototype.cancelWaiting = function () {
    if (this.battle) {
      this.battle.cancel();
      this.battle.stopTimer();
    }
    this.setMode("solo");
    this.switchTab(this.tab);
  };

  // ── Battle callbacks ──

  App.prototype.onWaiting = function (msg) {
    if (msg.room_code) {
      this.els.waitingTitle.textContent = "等待对手加入...";
      this.els.waitingCode.hidden = false;
      this.els.waitingCodeText.textContent = msg.room_code;
    }
  };

  App.prototype.onBattleStart = function (msg) {
    var self = this;
    this.setMode("playing");

    this.els.myName.textContent = this.battle.nickname;
    this.gridSize = msg.gridSize;
    this.renderer.setSize(msg.gridSize);

    var bs = msg.your_board;
    this.state = {
      size: bs.size, score: bs.score,
      reached2048: bs.reached2048 || false,
      nextId: this.findMaxId(bs.tiles) + 1,
      grid: bs.grid, tiles: bs.tiles,
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
    this.els.rematchBtn.textContent = "再来一局";
    this.els.rematchBtn.disabled = false;
    this.els.rematchBtn.classList.remove("disabled");
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
    var title = msg.winner === "you" ? "你赢了!" : msg.winner === "opponent" ? "你输了!" : "平局!";
    this.els.overlayTitle.textContent = title;
    this.els.overlayScores.hidden = false;
    this.els.overlayScores.textContent =
      this.battle.nickname + " " + msg.your_score + " — " +
      this.battle.opponentNickname + " " + msg.opponent_score;
    this.els.overlayActions.classList.add("hidden");
    this.els.overlayBattleActions.classList.remove("hidden");
    this.els.overlay.hidden = false;
  };

  App.prototype.onDisconnected = function () {
    if (this.mode === "waiting") {
      this.cancelWaiting();
      alert("与服务器断开连接，已自动取消等待。");
    } else if (this.mode === "playing") {
      this.battle.stopTimer();
      this.locked = true;
      this.els.overlayTitle.textContent = "连接断开!";
      this.els.overlayScores.hidden = true;
      this.els.overlayActions.classList.add("hidden");
      this.els.overlayBattleActions.classList.remove("hidden");
      this.els.overlay.hidden = false;
    }
  };

  App.prototype.exitBattle = function () {
    if (this.battle) {
      this.battle.cancel();
      this.battle.stopTimer();
    }
    this.locked = false;
    this.pendingDirection = null;
    this.renderer.hideOverlay();
    this.state = null;
    this.els.rematchBtn.textContent = "再来一局";
    this.els.rematchBtn.disabled = false;
    this.els.rematchBtn.classList.remove("disabled");
    this.setMode("solo");
    this.switchTab("solo");
    this.enterLobby();
    this.ensureSoloGame();
  };

  // ── Keyboard ──

  App.prototype.unbindKeyboard = function () {
    if (this.unbindInput) { this.unbindInput(); this.unbindInput = null; }
  };

  App.prototype.bindInput = function bindInput() {
    if (!window.Input2048) return;
    if (this.unbindInput) { this.unbindInput(); this.unbindInput = null; }
    var self = this;
    this.unbindInput = window.Input2048.bindInput({
      element: this.els.board,
      onMove: function (dir) { self.tryMove(dir); },
    });
  };

  // ── Util ──

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

  // ── Solo ──

  App.prototype.reset = function reset() {
    if (this.mode !== "solo") return;
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
    if (this.locked) { this.pendingDirection = direction; return; }
    if (!this.state) return;
    var result = window.Engine2048.move(this.state, direction);
    if (!result.moved) {
      if (result.gameOver && this.mode === "solo") this.renderer.showOverlay("游戏结束!");
      return;
    }
    var scoreBefore = this.state.score;
    this.state = result.state;
    if (this.state.score > this.best) {
      this.best = this.state.score;
      if (window.Storage2048) window.Storage2048.setBestScore(this.best);
    }
    if (this.mode === "playing" && this.battle) this.battle.sendMove(direction);
    this.locked = true;
    var self = this;
    this.renderer.apply(this.state, this.best, result.events, scoreBefore, function () {
      self.locked = false;
      if (self.mode === "playing" && self.els.myScore) {
        self.els.myScore.textContent = String(self.state.score);
      }
      if (result.gameOver && self.mode === "solo") self.renderer.showOverlay("游戏结束!");
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
