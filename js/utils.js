; (function () {
  'use strict';

  // small debounce helper to avoid excessive calls
  function debounce(fn, wait) {
    let t = null;
    return function (...args) {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // parse a list of numeric points from an SVG points string
  function parsePoints(str) {
    return String(str || '').trim().split(/\s+|,/).map(Number).filter(n => !Number.isNaN(n));
  }

  // Export reusable helpers under a single global to avoid leaking names
  W.UTILS = {
    debounce: debounce,
    parsePoints: parsePoints
  };

})();
