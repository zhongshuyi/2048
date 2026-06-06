(function () {
  function BattleClient(serverUrl) {
    this._serverUrl = serverUrl || "ws://" + (window.location.hostname || "localhost") + ":8081/ws/play";
    this.ws = null;
    this.connected = false;
    this._intentionalClose = false;
    this._pendingCb = null;
    this._connectTimeout = null;
    this.app = null;
    this.renderer = null;

    this.nickname = "";
    this.opponentNickname = "";
    this.mode = "timed";
    this.timeLimit = 0;
    this.gridSize = 4;

    this.timerEl = null;
    this.oppNameEl = null;
    this.oppScoreEl = null;
    this.oppBoardContainer = null;
    this._oppCells = null;
    this._oppLastSize = 0;
    this.timerInterval = null;
    this.timerEndAt = 0;
    this.timerRunning = false;
  }

  BattleClient.prototype.init = function (app) {
    this.app = app;
    this.renderer = app.renderer;
    this._tileColors = (window.Engine2048 && window.Engine2048.TILE_COLORS) || {};

    this.nickname = this.loadNickname();
    this.cacheDom();
  };

  BattleClient.prototype.cacheDom = function () {
    this.timerEl = document.getElementById("battleTimer");
    this.oppNameEl = document.getElementById("oppName");
    this.oppScoreEl = document.getElementById("oppScore");
    this.oppBoardContainer = document.getElementById("oppBoard");
  };

  BattleClient.prototype.loadNickname = function () {
    var stored = window.Storage2048 ? window.Storage2048.getNickname() : null;
    if (stored) return stored;
    var rand = window.Storage2048 ? window.Storage2048.randomNickname() : "Player";
    return rand;
  };

  BattleClient.prototype.connect = function () {
    var self = this;
    this._intentionalClose = false;
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
    }
    if (this._connectTimeout) { clearTimeout(this._connectTimeout); this._connectTimeout = null; }

    this.ws = new WebSocket(this._serverUrl);

    this.ws.onopen = function () {
      self.connected = true;
      if (self._pendingCb) {
        var cb = self._pendingCb;
        self._pendingCb = null;
        cb();
      }
    };

    this.ws.onmessage = function (e) {
      try {
        var msg = JSON.parse(e.data);
        self.handleMessage(msg);
      } catch (err) {
        // ignore parse errors
      }
    };

    this.ws.onclose = function () {
      self.connected = false;
      self.stopTimer();
      if (!self._intentionalClose && self.app && self.app.onDisconnected) {
        self.app.onDisconnected();
      }
      self._intentionalClose = false;
      self._pendingCb = null;
    };

    this.ws.onerror = function () {
      // onclose will fire next
    };
  };

  BattleClient.prototype.send = function (data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  };

  BattleClient.prototype.ensureConnected = function (cb) {
    if (this.connected) {
      cb();
      return;
    }
    this._pendingCb = cb;
    this.connect();
    var self = this;
    this._connectTimeout = setTimeout(function () {
      self._connectTimeout = null;
      if (self._pendingCb) {
        self._pendingCb = null;
      }
    }, 5000);
  };

  BattleClient.prototype.createRoom = function (mode, gridSize, timeLimit) {
    var self = this;
    this.mode = mode;
    this.gridSize = gridSize;
    this.timeLimit = timeLimit;
    this.ensureConnected(function () {
      self.send({
        type: "create_room",
        mode: mode,
        gridSize: gridSize,
        time: timeLimit,
        nickname: self.nickname,
      });
    });
  };

  BattleClient.prototype.joinRoom = function (code) {
    var self = this;
    this.ensureConnected(function () {
      self.send({
        type: "join_room",
        code: code,
        nickname: self.nickname,
      });
    });
  };

  BattleClient.prototype.joinMatch = function (mode, gridSize, timeLimit) {
    var self = this;
    this.mode = mode;
    this.gridSize = gridSize;
    this.timeLimit = timeLimit;
    this.ensureConnected(function () {
      self.send({
        type: "join_match",
        mode: mode,
        gridSize: gridSize,
        time: timeLimit,
        nickname: self.nickname,
      });
    });
  };

  BattleClient.prototype.sendMove = function (direction, state, reached2048, gameOver) {
    // Throttle: only send latest move every 80ms
    var valGrid = this.gridToValues(state.grid, state.tiles, state.size);
    this._pending = { direction: direction, grid: valGrid, score: state.score, reached2048: reached2048, gameOver: gameOver };
    if (this._sendTimer) return;
    var self = this;
    this._sendTimer = setTimeout(function () {
      self._sendTimer = null;
      var p = self._pending;
      self.send({
        type: "move",
        direction: p.direction,
        state: { grid: p.grid, score: p.score, reached2048: p.reached2048, gameOver: p.gameOver },
      });
    }, 80);
  };

  BattleClient.prototype.gridToValues = function (grid, tiles, size) {
    var result = [];
    for (var r = 0; r < size; r++) {
      var row = [];
      for (var c = 0; c < size; c++) {
        var tid = grid[r][c];
        row.push(tid && tiles[tid] ? tiles[tid].value : 0);
      }
      result.push(row);
    }
    return result;
  };

  BattleClient.prototype.sendRematch = function () {
    this.send({ type: "rematch" });
  };

  BattleClient.prototype.cancel = function () {
    this._intentionalClose = true;
    this.send({ type: "cancel" });
    this.stopTimer();
  };

  BattleClient.prototype.handleMessage = function (msg) {
    switch (msg.type) {
      case "waiting":
        this.app.onWaiting(msg);
        break;
      case "start":
        this.app.onBattleStart(msg);
        break;
      case "opponent_move":
        this.app.onOpponentMove(msg);
        break;
      case "game_over":
        this.app.onGameOver(msg);
        break;
      case "error":
        break;
    }
  };

  BattleClient.prototype.startTimer = function (totalSeconds, countDown) {
    var self = this;
    this.stopTimer();
    this.timerEndAt = Date.now() + totalSeconds * 1000;
    this.timerRunning = true;
    this.countDown = countDown;
    this.totalSeconds = totalSeconds;

    var update = function () {
      if (!self.timerRunning) return;
      var now = Date.now();
      var remainingMs = self.timerEndAt - now;

      if (countDown) {
        if (remainingMs <= 0) {
          self.renderTimerMs(0, true);
          self.stopTimer();
          return;
        }
        self.renderTimerMs(remainingMs, true);
      } else {
        var elapsed = Math.floor((now - (self.timerEndAt - totalSeconds * 1000)) / 1000);
        self.renderTimer(elapsed, false);
      }
    };

    update();
    this.timerInterval = setInterval(update, 50);
  };

  BattleClient.prototype.stopTimer = function () {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.timerRunning = false;
  };

  BattleClient.prototype.renderTimerMs = function (remainingMs, isCountdown) {
    if (!this.timerEl) return;
    var totalSec = remainingMs / 1000;
    var mins = Math.floor(totalSec / 60);
    var secs = Math.floor(totalSec % 60);

    // Last 10 seconds: show milliseconds
    if (totalSec <= 10) {
      var tenths = Math.floor((totalSec - Math.floor(totalSec)) * 10);
      this.timerEl.textContent = secs + "." + tenths;
      this.timerEl.classList.add("timer-pulse");
    } else {
      this.timerEl.textContent = mins + ":" + (secs < 10 ? "0" : "") + secs;
      if (totalSec <= 30) {
        this.timerEl.classList.add("timer-pulse");
      } else {
        this.timerEl.classList.remove("timer-pulse");
      }
    }
  };

  BattleClient.prototype.renderTimer = function (seconds, isCountdown) {
    if (!this.timerEl) return;
    var mins = Math.floor(seconds / 60);
    var secs = seconds % 60;
    this.timerEl.textContent = mins + ":" + (secs < 10 ? "0" : "") + secs;
    this.timerEl.classList.remove("timer-pulse");
  };

  BattleClient.prototype.renderOpponentMini = function (grid, size) {
    if (!this.oppBoardContainer) return;
    var container = this.oppBoardContainer;

    // Rebuild grid only if size changed
    if (size !== this._oppLastSize) {
      this._oppLastSize = size;
      container.innerHTML = "";
      this._oppCells = [];
      var cellGap = Math.max(1, Math.floor(110 / (size * 5)));
      var cellSize = Math.floor((110 - cellGap * (size + 1)) / size);

      container.style.display = "grid";
      container.style.gridTemplateColumns = "repeat(" + size + ", " + cellSize + "px)";
      container.style.gridTemplateRows = "repeat(" + size + ", " + cellSize + "px)";
      container.style.gap = cellGap + "px";
      container.style.padding = cellGap + "px";

      for (var r = 0; r < size; r++) {
        for (var c = 0; c < size; c++) {
          var cell = document.createElement("div");
          cell.style.borderRadius = Math.max(1, cellSize * 0.15) + "px";
          cell.style.display = "flex";
          cell.style.alignItems = "center";
          cell.style.justifyContent = "center";
          cell.style.fontWeight = "700";
          cell.style.fontSize = Math.max(9, cellSize * 0.5) + "px";
          container.appendChild(cell);
          this._oppCells.push(cell);
        }
      }
    }

    // Update cell contents only
    var cells = this._oppCells;
    for (var i = 0; i < cells.length; i++) {
      var r = Math.floor(i / size);
      var c = i % size;
      var value = grid[r][c] || 0;
      var cell = cells[i];
      if (value > 0) {
        cell.style.background = this.tileColor(value);
        cell.textContent = this.tileText(value);
        cell.style.color = value >= 8 ? "#f9f6f2" : "#776e65";
      } else {
        cell.style.background = "rgba(238,228,218,0.35)";
        cell.textContent = "";
      }
    }
  };

  BattleClient.prototype.tileColor = function (value) {
    return this._tileColors[value] || (value <= 4096 ? "#3c3a32" : "#3c3a32");
  };

  BattleClient.prototype.tileText = function (value) {
    if (value >= 10000) return String(Math.floor(value / 1000)) + "K";
    return String(value);
  };

  BattleClient.prototype.renderOpponentScore = function (score) {
    if (this.oppScoreEl) {
      this.oppScoreEl.textContent = String(score);
    }
  };

  BattleClient.prototype.destroy = function () {
    this._intentionalClose = true;
    this.stopTimer();
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
  };

  window.BattleClient = BattleClient;
})();
