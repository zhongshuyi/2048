(function () {
  const BEST_KEY = "solo-2048-best";

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

  window.Storage2048 = {
    getBestScore,
    setBestScore,
  };
})();

