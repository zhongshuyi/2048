(function () {
  const THRESHOLD_PX = 14;

  function bindInput(options) {
    const el = options.element;
    const onMove = options.onMove;

    function emit(direction) {
      if (typeof onMove === "function") {
        onMove(direction);
      }
    }

    function onKeyDown(e) {
      const key = e.key;
      if (key === "ArrowLeft") {
        e.preventDefault();
        emit("left");
      } else if (key === "ArrowRight") {
        e.preventDefault();
        emit("right");
      } else if (key === "ArrowUp") {
        e.preventDefault();
        emit("up");
      } else if (key === "ArrowDown") {
        e.preventDefault();
        emit("down");
      }
    }

    window.addEventListener("keydown", onKeyDown, { passive: false });

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let fired = false;

    function start(x, y) {
      startX = x;
      startY = y;
      tracking = true;
      fired = false;
    }

    function move(x, y) {
      if (!tracking || fired) return;
      const dx = x - startX;
      const dy = y - startY;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (Math.max(adx, ady) < THRESHOLD_PX) return;
      fired = true;
      if (adx >= ady) {
        emit(dx > 0 ? "right" : "left");
      } else {
        emit(dy > 0 ? "down" : "up");
      }
    }

    function end() {
      tracking = false;
      fired = false;
    }

    function onTouchStart(e) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      start(t.clientX, t.clientY);
    }

    function onTouchMove(e) {
      if (!tracking || e.touches.length !== 1) return;
      const t = e.touches[0];
      move(t.clientX, t.clientY);
      e.preventDefault();
    }

    function onTouchEnd() {
      end();
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    function onMouseDown(e) {
      start(e.clientX, e.clientY);
    }

    function onMouseMove(e) {
      if (!tracking) return;
      move(e.clientX, e.clientY);
    }

    function onMouseUp() {
      end();
    }

    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return function unbind() {
      window.removeEventListener("keydown", onKeyDown);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }

  window.Input2048 = {
    bindInput,
  };
})();

