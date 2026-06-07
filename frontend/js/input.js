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
      var tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable) return;

      var dir = null;
      var key = e.key;
      if (key === "ArrowLeft"  || key === "a" || key === "A") { dir = "left"; }
      else if (key === "ArrowRight" || key === "d" || key === "D") { dir = "right"; }
      else if (key === "ArrowUp"    || key === "w" || key === "W") { dir = "up"; }
      else if (key === "ArrowDown"  || key === "s" || key === "S") { dir = "down"; }

      if (dir) {
        e.preventDefault();
        emit(dir);
      }
    }

    window.addEventListener("keydown", onKeyDown, { passive: false });

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let fired = false;
    let activePointerId = null;

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
      activePointerId = null;
    }

    var supportsPointer = typeof window.PointerEvent !== "undefined";

    function onPointerDown(e) {
      if (activePointerId != null) return;
      activePointerId = e.pointerId;
      try {
        if (el.setPointerCapture) el.setPointerCapture(activePointerId);
      } catch (_) {}
      start(e.clientX, e.clientY);
    }

    function onPointerMove(e) {
      if (!tracking || activePointerId == null || e.pointerId !== activePointerId) return;
      move(e.clientX, e.clientY);
    }

    function onPointerUp(e) {
      if (activePointerId == null || e.pointerId !== activePointerId) return;
      end();
    }

    function onPointerCancel(e) {
      if (activePointerId == null || e.pointerId !== activePointerId) return;
      end();
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

    if (supportsPointer) {
      el.addEventListener("pointerdown", onPointerDown, { passive: true });
      el.addEventListener("pointermove", onPointerMove, { passive: true });
      el.addEventListener("pointerup", onPointerUp, { passive: true });
      el.addEventListener("pointercancel", onPointerCancel, { passive: true });
    } else {
      el.addEventListener("touchstart", onTouchStart, { passive: true });
      el.addEventListener("touchmove", onTouchMove, { passive: false });
      el.addEventListener("touchend", onTouchEnd, { passive: true });
      el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    }

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

    if (!supportsPointer) {
      el.addEventListener("mousedown", onMouseDown);
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }

    return function unbind() {
      window.removeEventListener("keydown", onKeyDown);
      if (supportsPointer) {
        el.removeEventListener("pointerdown", onPointerDown);
        el.removeEventListener("pointermove", onPointerMove);
        el.removeEventListener("pointerup", onPointerUp);
        el.removeEventListener("pointercancel", onPointerCancel);
      } else {
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchmove", onTouchMove);
        el.removeEventListener("touchend", onTouchEnd);
        el.removeEventListener("touchcancel", onTouchEnd);
      }
      if (!supportsPointer) {
        el.removeEventListener("mousedown", onMouseDown);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      }
    };
  }

  window.Input2048 = {
    bindInput,
  };
})();

