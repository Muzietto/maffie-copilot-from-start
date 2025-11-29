// Compute thumbnail heights so they share the same proportions as #main-area
function updateThumbHeights() {
    const main = document.getElementById('main-area');
    const thumbs = document.querySelectorAll('.thumb');
    if (!main || !thumbs.length) return;
    const rect = main.getBoundingClientRect();
    // protect against zero height
    const ratio = rect.height > 0 ? rect.width / rect.height : 1;
    thumbs.forEach(t => {
        const w = t.clientWidth;
        const h = ratio > 0 ? Math.round(w / ratio) : w;
        t.style.height = h + 'px';
    });
}

window.addEventListener('load', updateThumbHeights);
window.addEventListener('resize', updateThumbHeights);
// also update after images load in case they affect layout
document.querySelectorAll('.thumb img').forEach(img => img.addEventListener('load', updateThumbHeights));

// Wire thumbnails: add hover text (filename without extension) and click handler
function wireThumbnails() {
    document.querySelectorAll('.thumb').forEach(thumb => {
        const img = thumb.querySelector('img');
        if (!img) return;
        const src = img.getAttribute('src') || '';
        const name = src.split('/').pop();
        const base = name.replace(/\.[^/.]+$/, ''); // remove file extension
        thumb.style.cursor = 'pointer';
        thumb.title = base; // native tooltip on hover (without extension)
        img.title = base;
        thumb.addEventListener('click', async () => {
            console.log('You clicked ' + base);
            // visual selection: mark this thumbnail as selected and clear others
            try {
                document.querySelectorAll('.thumb.selected').forEach(t => t.classList.remove('selected'));
                thumb.classList.add('selected');
            } catch (e) {
                console.error('Error setting selected thumbnail class', e);
            }
            // set canvas border color to match thumbnail border
            const thumbStyle = getComputedStyle(thumb);
            const borderColor = thumbStyle.borderColor || '#000';
            const canvas = document.getElementById('main-canvas');
            if (canvas) {
                canvas.style.border = '4px solid ' + borderColor;
            }

            // fetch and draw the SVG as vector paths onto the canvas
            try {
                const res = await fetch(src);
                if (!res.ok) throw new Error('Failed to fetch ' + src + ' (' + res.status + ')');
                const svgText = await res.text();
                // remember the last loaded SVG so we can redraw on resize
                if (window.MAFFIE && typeof window.MAFFIE.setLastSvg === 'function') {
                    window.MAFFIE.setLastSvg(svgText);
                } else {
                    // fallback to the legacy global slot if MAFFIE isn't ready
                    window._lastSvgText = svgText;
                }
                if (window.MAFFIE && typeof window.MAFFIE.drawSvgOnCanvas === 'function') {
                    window.MAFFIE.drawSvgOnCanvas(svgText, canvas);
                } else {
                    // fallback if MAFFIE isn't ready for some reason
                    try { drawSvgOnCanvas(svgText, canvas); } catch (e) { console.error('No draw function available', e); }
                }
            } catch (err) {
                console.error('Error drawing SVG:', err);
            }
        });
    });
    // after wiring thumbnails, auto-select the first thumbnail so the page shows content immediately
    try {
        // ensure canvas and thumbnails sizes are up-to-date
        if (window.MAFFIE && typeof window.MAFFIE.resizeMainCanvas === 'function') {
            window.MAFFIE.resizeMainCanvas();
        }
        updateThumbHeights();
        const first = document.querySelector('.thumb');
        if (first) {
            // simulate a user click to reuse the existing click handler (sets border color, fetches and draws SVG)
            first.click();
        }
    } catch (e) {
        console.error('Auto-select first thumbnail failed:', e);
    }
}

window.addEventListener('load', wireThumbnails);
