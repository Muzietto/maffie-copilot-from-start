(function () {
  // Interaction helper: enable grab/grabbing cursors only when W.MAFFIE._bgImage is set
  var canvas = document.getElementById('main-canvas');
  if (!canvas) return;

  function enableCanGrab() {
    canvas.classList.add('can-grab');
  }

  function disableCanGrab() {
    canvas.classList.remove('can-grab');
    canvas.classList.remove('grabbing');
  }

  function onPointerDown() {
    if (!canvas.classList.contains('can-grab')) return;
    canvas.classList.add('grabbing');
    // start pan
    isDragging = true;
    // initial pointer position
    lastX = lastY = null;
    try {
      const ev = window._interaction_last_event || null;
      // not used, we'll capture move events directly
    } catch (e) { /* ignore */ }
    // capture starting offset
    try {
      const off = (window.W && W.MAFFIE && W.MAFFIE._bgOffset) || { x: 0, y: 0 };
      startOffsetX = off.x || 0;
      startOffsetY = off.y || 0;
    } catch (e) {
      startOffsetX = 0; startOffsetY = 0;
    }
    // attach move listeners
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
  }

  function onPointerUp() {
    canvas.classList.remove('grabbing');
    // end pan
    isDragging = false;
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('touchmove', onTouchMove);
  }

  // Sync from W.MAFFIE._bgImage presence. Uses both an event hook (if provided) and a short-poll fallback.
  function syncFromMaffie() {
    try {
      if (window.W && W.MAFFIE && W.MAFFIE._bgImage) {
        enableCanGrab();
      } else {
        disableCanGrab();
      }
    } catch (err) {
      disableCanGrab();
    }
  }

  // Panning state
  var isDragging = false;
  var lastX = null, lastY = null;
  var startOffsetX = 0, startOffsetY = 0;

  function onPointerMove(e) {
    if (!isDragging) return;
    if (!canvas.classList.contains('can-grab')) return;
    var cx = e.clientX, cy = e.clientY;
    if (lastX === null) {
      lastX = cx; lastY = cy;
    }
    var dx = cx - lastX;
    var dy = cy - lastY;
    lastX = cx; lastY = cy;
    try {
      if (window.W && W.MAFFIE) {
        if (!W.MAFFIE._bgOffset) W.MAFFIE._bgOffset = { x: 0, y: 0 };
        W.MAFFIE._bgOffset.x = (W.MAFFIE._bgOffset.x || 0) + dx;
        W.MAFFIE._bgOffset.y = (W.MAFFIE._bgOffset.y || 0) + dy;
        // request a redraw
        if (typeof W.MAFFIE.requestRedraw === 'function') W.MAFFIE.requestRedraw();
        else window.dispatchEvent(new Event('maffie:bgchange'));
      }
    } catch (err) {
      // ignore
    }
  }

  function onTouchMove(ev) {
    if (!isDragging) return;
    if (!ev.touches || ev.touches.length === 0) return;
    // prevent scroll while panning
    ev.preventDefault();
    var t = ev.touches[0];
    onPointerMove({ clientX: t.clientX, clientY: t.clientY });
  }

  // Wire events
  canvas.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('mouseleave', onPointerUp);

  // touch support
  canvas.addEventListener('touchstart', onPointerDown, { passive: true });
  window.addEventListener('touchend', onPointerUp);

  // Listen for an optional custom event 'maffie:bgchange' if other code dispatches it
  window.addEventListener('maffie:bgchange', syncFromMaffie);

  // Poll as a fallback in case MAFFIE doesn't emit events (checks every 400ms)
  var pollId = setInterval(syncFromMaffie, 400);

  // cleanup on unload
  window.addEventListener('unload', function () {
    clearInterval(pollId);
  });

  // initial sync
  syncFromMaffie();
})();
