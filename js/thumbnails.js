; (function () {
    'use strict';

    // Uses global aliases from js/globals.js: W = window, D = document

    function updateThumbHeights() {
        const main = D.getElementById('main-area');
        const thumbs = D.querySelectorAll('.thumb');
        if (!main || !thumbs.length) return;
        const rect = main.getBoundingClientRect();
        const ratio = rect.height > 0 ? rect.width / rect.height : 1;
        thumbs.forEach(t => {
            const w = t.clientWidth;
            const h = ratio > 0 ? Math.round(w / ratio) : w;
            t.style.height = h + 'px';
        });
    }

    // debounce moved to js/utils.js as W.UTILS.debounce

    async function onThumbClick(thumb) {
        const img = thumb.querySelector('img');
        if (!img) return;
        const src = img.getAttribute('src') || '';
        const name = src.split('/').pop();
        const base = name.replace(/\.[^/.]+$/, '');

        // visual selection
        try {
            D.querySelectorAll('.thumb.selected').forEach(t => t.classList.remove('selected'));
            thumb.classList.add('selected');
        } catch (e) {
            console.error('Error setting selected thumbnail', e);
        }

        const thumbStyle = getComputedStyle(thumb);
        const borderColor = thumbStyle.borderColor || '#000';
        const canvas = D.getElementById('main-canvas');
        if (canvas) canvas.style.border = '4px solid ' + borderColor;

        try {
            const res = await fetch(src);
            if (!res.ok) throw new Error('Failed to fetch ' + src + ' (' + res.status + ')');
            const svgText = await res.text();
            if (W.MAFFIE && typeof W.MAFFIE.setLastSvg === 'function') {
                W.MAFFIE.setLastSvg(svgText);
            } else {
                W._lastSvgText = svgText;
            }
            if (W.MAFFIE && typeof W.MAFFIE.drawSvgOnCanvas === 'function') {
                W.MAFFIE.drawSvgOnCanvas(svgText, canvas);
            }
        } catch (err) {
            console.error('Error loading/drawing SVG:', err);
        }
    }

    function wireThumbnails() {
        D.querySelectorAll('.thumb').forEach(thumb => {
            const img = thumb.querySelector('img');
            if (!img) return;
            const src = img.getAttribute('src') || '';
            const name = src.split('/').pop();
            const base = name.replace(/\.[^/.]+$/, '');
            thumb.style.cursor = 'pointer';
            thumb.title = base;
            img.title = base;
            thumb.addEventListener('click', () => onThumbClick(thumb));
        });

        // auto select first thumb (click the .thumb container so our existing handler triggers)
        const first = D.querySelector('.thumb');
        if (first) first.click();
    }

    W.addEventListener('load', () => {
        updateThumbHeights();
        wireThumbnails();
    });
    W.addEventListener('resize', (W.UTILS && typeof W.UTILS.debounce === 'function') ? W.UTILS.debounce(updateThumbHeights, 120) : updateThumbHeights);
    D.querySelectorAll('.thumb img').forEach(img => img.addEventListener('load', updateThumbHeights));

})();
