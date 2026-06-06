(function () {
  const BEST_KEY = "solo-2048-best";
  var NICK_KEY = "solo-2048-nickname";
  var SERVER_KEY = "solo-2048-server";

  function normalizeNumber(v) {
    if (typeof v !== "number") {
      return 0;
    }
    if (!Number.isFinite(v)) {
      return 0;
    }
    return Math.max(0, Math.floor(v));
  }

  function getBestScore() {
    try {
      const raw = localStorage.getItem(BEST_KEY);
      if (raw == null) {
        return 0;
      }
      const n = Number(raw);
      return normalizeNumber(n);
    } catch (e) {
      return 0;
    }
  }

  function setBestScore(score) {
    try {
      localStorage.setItem(BEST_KEY, String(normalizeNumber(score)));
    } catch (e) {}
  }

  function getNickname() {
    try {
      var raw = localStorage.getItem(NICK_KEY);
      if (raw == null) return null;
      return raw.trim() || null;
    } catch (e) {
      return null;
    }
  }

  function setNickname(name) {
    try {
      localStorage.setItem(NICK_KEY, String(name).trim());
    } catch (e) {}
  }

  function randomNickname() {
    var adjs = ["Swift", "Brave", "Clever", "Fierce", "Lucky", "Mighty", "Sharp", "Cool", "Wild", "Bold"];
    var nouns = ["Panda", "Tiger", "Fox", "Eagle", "Shark", "Wolf", "Bear", "Hawk", "Lynx", "Owl"];
    var adj = adjs[Math.floor(Math.random() * adjs.length)];
    var noun = nouns[Math.floor(Math.random() * nouns.length)];
    return adj + noun;
  }

  function getServerUrl() {
    try {
      var raw = localStorage.getItem(SERVER_KEY);
      return (raw && raw.trim()) || null;
    } catch (e) {
      return null;
    }
  }

  function setServerUrl(url) {
    try {
      localStorage.setItem(SERVER_KEY, String(url).trim());
    } catch (e) {}
  }

  window.Storage2048 = {
    getBestScore,
    setBestScore,
    getNickname: getNickname,
    setNickname: setNickname,
    randomNickname: randomNickname,
    getServerUrl: getServerUrl,
    setServerUrl: setServerUrl,
  };
})();

