const CardSwipe = (() => {
  const SWIPE_RATIO = 1.15;
  const MIN_DRAG = 8;

  function init(card, { onSwipeLeft }) {
    let startX = 0;
    let startY = 0;
    let dragging = false;
    let swipeMode = null;
    let touchActive = false;
    let activePointerId = null;

    function resetTransform() {
      card.style.transform = "";
      card.style.opacity = "";
    }

    function setDragTransform(dx) {
      const tx = Math.min(0, dx);
      const rotate = Math.max(-12, tx * 0.04);
      card.style.transform = `translateX(${tx}px) rotate(${rotate}deg)`;
      card.style.opacity = String(Math.max(0.45, 1 + tx / 500));
    }

    function canStartSwipe(target) {
      return !target.closest(
        "a, button, select, input, textarea, summary, .wiki-game"
      );
    }

    function clearSelection() {
      const sel = window.getSelection();
      if (sel?.rangeCount) sel.removeAllRanges();
    }

    function pointFromEvent(e, end = false) {
      if (end && e.changedTouches?.length) {
        const t = e.changedTouches[0];
        return { x: t.clientX, y: t.clientY };
      }
      if (e.touches?.length) {
        const t = e.touches[0];
        return { x: t.clientX, y: t.clientY };
      }
      return { x: e.clientX, y: e.clientY };
    }

    function finishDrag(e) {
      if (!dragging) return;

      const pt = pointFromEvent(e, true);
      const dx = pt.x - startX;
      const threshold = Math.min(120, card.offsetWidth * 0.28);
      const shouldSwipe = swipeMode === "horizontal" && dx < -threshold;

      dragging = false;
      swipeMode = null;
      touchActive = false;
      activePointerId = null;
      card.classList.remove("card--dragging");

      try {
        if (e.pointerId !== undefined) {
          card.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* ignore */
      }

      if (shouldSwipe) {
        onSwipeLeft();
      } else {
        resetTransform();
      }
    }

    function onStart(e) {
      if (!canStartSwipe(e.target)) return;

      if (e.type === "pointerdown") {
        if (e.pointerType === "touch" || touchActive) return;
        if (e.button !== 0) return;
        activePointerId = e.pointerId;
        try {
          card.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }

      if (e.type === "touchstart") {
        if (touchActive) return;
        touchActive = true;
      }

      const pt = pointFromEvent(e);
      dragging = true;
      swipeMode = e.target.closest(".card__strip") ? "horizontal" : null;
      startX = pt.x;
      startY = pt.y;
      card.classList.add("card--dragging");
      clearSelection();

      if (e.type === "pointerdown" && e.pointerType === "mouse") {
        e.preventDefault();
      }
    }

    function onMove(e) {
      if (!dragging) return;

      if (
        e.type === "pointermove" &&
        activePointerId !== null &&
        e.pointerId !== activePointerId
      ) {
        return;
      }

      const pt = pointFromEvent(e);
      const dx = pt.x - startX;
      const dy = pt.y - startY;

      if (swipeMode === null) {
        if (Math.abs(dx) < MIN_DRAG && Math.abs(dy) < MIN_DRAG) return;
        swipeMode =
          Math.abs(dx) > Math.abs(dy) * SWIPE_RATIO ? "horizontal" : "vertical";
        if (swipeMode === "horizontal") clearSelection();
      }

      if (swipeMode === "horizontal") {
        if (e.cancelable) e.preventDefault();
        setDragTransform(dx);
      }
    }

    function onCancel() {
      dragging = false;
      swipeMode = null;
      touchActive = false;
      activePointerId = null;
      card.classList.remove("card--dragging");
      resetTransform();
      clearSelection();
    }

    card.addEventListener("pointerdown", onStart);
    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerup", finishDrag);
    card.addEventListener("pointercancel", onCancel);

    card.addEventListener("touchstart", onStart, { passive: true });
    card.addEventListener("touchmove", onMove, { passive: false });
    card.addEventListener("touchend", finishDrag, { passive: true });
    card.addEventListener("touchcancel", onCancel, { passive: true });

    return { resetTransform };
  }

  function playExitLeft(card) {
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(fallback);
        card.removeEventListener("transitionend", finish);
        resolve();
      };
      const fallback = setTimeout(finish, 400);
      card.addEventListener("transitionend", finish);
      card.classList.add("card--exit-left");
      card.style.transform = "";
      card.style.opacity = "";
    });
  }

  function playEnter(card) {
    card.classList.remove("card--exit-left");
    card.classList.add("card--enter");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => card.classList.remove("card--enter"));
    });
  }

  return { init, playExitLeft, playEnter };
})();
