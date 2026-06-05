(function () {
  var WS_URL = "ws://" + (window.location.hostname || "localhost") + ":8081/ws/play";

  function BattleClient() {
    this.ws = null;
    this.connected = false;
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
    this.timerInterval = null;
    this.timerEndAt = 0;
    this.timerRunning = false;
  }

  BattleClient.prototype.init = function (app) {
    this.app = app;
    this.renderer = app.renderer;

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
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
    }
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = function () {
      self.connected = true;
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
      if (self.app && self.app.onDisconnected) {
        self.app.onDisconnected();
      }
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
    var self = this;
    this.connect();
    var check = setInterval(function () {
      if (self.connected) {
        clearInterval(check);
        cb();
      }
    }, 50);
    setTimeout(function () { clearInterval(check); }, 5000);
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

  BattleClient.prototype.sendMove = function (direction) {
    this.send({ type: "move", direction: direction });
  };

  BattleClient.prototype.sendRematch = function () {
    this.send({ type: "rematch" });
  };

  BattleClient.prototype.cancel = function () {
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
    container.innerHTML = "";
    var cellGap = Math.max(1, Math.floor(90 / (size * 5)));
    var cellSize = Math.floor((90 - cellGap * (size + 1)) / size);

    container.style.display = "grid";
    container.style.gridTemplateColumns = "repeat(" + size + ", " + cellSize + "px)";
    container.style.gridTemplateRows = "repeat(" + size + ", " + cellSize + "px)";
    container.style.gap = cellGap + "px";
    container.style.padding = cellGap + "px";

    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        var cell = document.createElement("div");
        var id = grid[r][c];
        if (id !== 0 && id !== "0") {
          var tile = this.app.state.tiles[id];
          var value = tile ? tile.value : 0;
          cell.style.background = this.tileColor(value);
          cell.textContent = value > 0 ? this.tileText(value) : "";
          cell.style.color = value >= 8 ? "#f9f6f2" : "#776e65";
          cell.style.fontWeight = "700";
          cell.style.fontSize = Math.max(9, cellSize * 0.5) + "px";
        } else {
          cell.style.background = "rgba(238,228,218,0.35)";
        }
        cell.style.borderRadius = Math.max(1, cellSize * 0.15) + "px";
        cell.style.display = "flex";
        cell.style.alignItems = "center";
        cell.style.justifyContent = "center";
        container.appendChild(cell);
      }
    }
  };

  BattleClient.prototype.tileColor = function (value) {
    var map = {
      2: "#eee4da", 4: "#ede0c8", 8: "#f2b179", 16: "#f59563",
      32: "#f67c5f", 64: "#f65e3b", 128: "#edcf72", 256: "#edcc61",
      512: "#edc850", 1024: "#edc53f", 2048: "#edc22e",
    };
    return map[value] || (value <= 4096 ? "#3c3a32" : "#3c3a32");
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
    this.stopTimer();
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
  };

  window.BattleClient = BattleClient;
})();
