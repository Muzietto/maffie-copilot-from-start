; (function () {
    'use strict';

    // Ensure the canvas drawing buffer matches its displayed size
    function resizeMainCanvas() {
        const canvas = D.getElementById('main-canvas');
        if (!canvas) return;
        const styles = W.getComputedStyle(canvas);
        const width = Math.max(0, canvas.clientWidth - parseFloat(styles.paddingLeft || 0) - parseFloat(styles.paddingRight || 0));
        const height = Math.max(0, canvas.clientHeight - parseFloat(styles.paddingTop || 0) - parseFloat(styles.paddingBottom || 0));
        // set backing store size for crisp rendering
        if (canvas.width !== Math.round(width) || canvas.height !== Math.round(height)) {
            canvas.width = Math.round(width);
            canvas.height = Math.round(height);
        }
    }

    // Redraw on load/resize when appropriate
    W.addEventListener('load', resizeMainCanvas);

    // NOTE: last-SVG storage is kept on the exported MAFFIE object so
    // other modules can access it through the defined API. References
    // in runtime handlers read via W.MAFFIE.getLastSvg() to avoid
    // relying on a closure-scoped variable.

    // helpers moved to js/utils.js (W.UTILS.debounce / W.UTILS.parsePoints)

    const handleResize = () => {
        resizeMainCanvas();
        // if we have previously loaded an SVG, redraw it to match the new canvas size
        try {
            const canvas = D.getElementById('main-canvas');
            const last = (W.MAFFIE && typeof W.MAFFIE.getLastSvg === 'function') ? W.MAFFIE.getLastSvg() : null;
            if (last && canvas) {
                // call draw without awaiting to avoid blocking resize event
                drawSvgOnCanvas(last, canvas);
            }
        } catch (e) {
            // defensive: don't let resize errors surface
            console.error('Error redrawing SVG on resize:', e);
        }
    };

    W.addEventListener('resize', (W.UTILS && typeof W.UTILS.debounce === 'function') ? W.UTILS.debounce(handleResize, 150) : handleResize);

    // also update when thumbnails images load to keep layout consistent
    D.querySelectorAll('.thumb img').forEach(img => img.addEventListener('load', () => {
        resizeMainCanvas();
        try {
            const canvas = D.getElementById('main-canvas');
            const last = (W.MAFFIE && typeof W.MAFFIE.getLastSvg === 'function') ? W.MAFFIE.getLastSvg() : null;
            if (last && canvas) drawSvgOnCanvas(last, canvas);
        } catch (e) {
            console.error('Error redrawing SVG after image load:', e);
        }
    }));

    // parsePoints moved to W.UTILS.parsePoints

    // Draw parsed SVG onto a canvas using canvas API (vector path conversion)
    async function drawSvgOnCanvas(svgText, canvas) {
        if (!canvas) return;
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgText, 'image/svg+xml');
        const svg = doc.querySelector('svg');
        if (!svg) {
            console.warn('No <svg> element found');
            return;
        }

        // Get viewBox or width/height
        let vb = svg.getAttribute('viewBox');
        let svgW, svgH;
        if (vb) {
            const parts = vb.split(/\s+/).map(Number);
            if (parts.length === 4) { svgW = parts[2]; svgH = parts[3]; }
        }
        if (!svgW || !svgH) {
            svgW = parseFloat(svg.getAttribute('width')) || svg.getBoundingClientRect().width || canvas.clientWidth;
            svgH = parseFloat(svg.getAttribute('height')) || svg.getBoundingClientRect().height || canvas.clientHeight;
        }

        // resize drawing buffer to canvas displayed size
        resizeMainCanvas();
        const ctx = canvas.getContext('2d');
        // clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // compute scaling to fit svg into canvas while preserving aspect
        const sx = canvas.width / svgW;
        const sy = canvas.height / svgH;
        const scale = Math.min(sx, sy);
        const tx = (canvas.width - svgW * scale) / 2;
        const ty = (canvas.height - svgH * scale) / 2;

        ctx.save();
        ctx.translate(tx, ty);
        ctx.scale(scale, scale);

        // recursive draw for supported elements
        function drawElement(el) {
            const tag = el.tagName && el.tagName.toLowerCase();
            if (!tag) return;
            const style = el.getAttribute('style') || '';
            const fill = el.getAttribute('fill') || (style.match(/fill:\s*([^;]+)/) ? RegExp.$1 : 'black');
            const stroke = el.getAttribute('stroke') || (style.match(/stroke:\s*([^;]+)/) ? RegExp.$1 : null);
            const strokeWidth = parseFloat(el.getAttribute('stroke-width') || (style.match(/stroke-width:\s*([^;]+)/) ? RegExp.$1 : 1)) || 1;

            if (tag === 'path') {
                const d = el.getAttribute('d');
                if (!d) return;
                try {
                    const p = new Path2D(d);
                    if (fill && fill !== 'none') { ctx.fillStyle = fill; ctx.fill(p); }
                    if (stroke && stroke !== 'none') { ctx.lineWidth = strokeWidth; ctx.strokeStyle = stroke; ctx.stroke(p); }
                } catch (e) {
                    console.warn('Path2D failed for d:', d, e);
                }
            } else if (tag === 'rect') {
                const x = parseFloat(el.getAttribute('x') || 0);
                const y = parseFloat(el.getAttribute('y') || 0);
                const w = parseFloat(el.getAttribute('width') || 0);
                const h = parseFloat(el.getAttribute('height') || 0);
                const rx = parseFloat(el.getAttribute('rx') || 0);
                const ry = parseFloat(el.getAttribute('ry') || rx);
                if (rx || ry) {
                    // rounded rect
                    ctx.beginPath();
                    const r = rx || ry;
                    ctx.moveTo(x + r, y);
                    ctx.arcTo(x + w, y, x + w, y + h, r);
                    ctx.arcTo(x + w, y + h, x, y + h, r);
                    ctx.arcTo(x, y + h, x, y, r);
                    ctx.arcTo(x, y, x + w, y, r);
                    ctx.closePath();
                    if (fill && fill !== 'none') { ctx.fillStyle = fill; ctx.fill(); }
                    if (stroke && stroke !== 'none') { ctx.lineWidth = strokeWidth; ctx.strokeStyle = stroke; ctx.stroke(); }
                } else {
                    if (fill && fill !== 'none') { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
                    if (stroke && stroke !== 'none') { ctx.lineWidth = strokeWidth; ctx.strokeStyle = stroke; ctx.strokeRect(x, y, w, h); }
                }
            } else if (tag === 'circle') {
                const cx = parseFloat(el.getAttribute('cx') || 0);
                const cy = parseFloat(el.getAttribute('cy') || 0);
                const r = parseFloat(el.getAttribute('r') || 0);
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                if (fill && fill !== 'none') { ctx.fillStyle = fill; ctx.fill(); }
                if (stroke && stroke !== 'none') { ctx.lineWidth = strokeWidth; ctx.strokeStyle = stroke; ctx.stroke(); }
            } else if (tag === 'ellipse') {
                const cx = parseFloat(el.getAttribute('cx') || 0);
                const cy = parseFloat(el.getAttribute('cy') || 0);
                const rx = parseFloat(el.getAttribute('rx') || 0);
                const ry = parseFloat(el.getAttribute('ry') || 0);
                ctx.beginPath();
                ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                if (fill && fill !== 'none') { ctx.fillStyle = fill; ctx.fill(); }
                if (stroke && stroke !== 'none') { ctx.lineWidth = strokeWidth; ctx.strokeStyle = stroke; ctx.stroke(); }
            } else if (tag === 'line') {
                const x1 = parseFloat(el.getAttribute('x1') || 0);
                const y1 = parseFloat(el.getAttribute('y1') || 0);
                const x2 = parseFloat(el.getAttribute('x2') || 0);
                const y2 = parseFloat(el.getAttribute('y2') || 0);
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                if (stroke && stroke !== 'none') { ctx.lineWidth = strokeWidth; ctx.strokeStyle = stroke; ctx.stroke(); }
            } else if (tag === 'polyline' || tag === 'polygon') {
                const pts = el.getAttribute('points') || '';
                const nums = (W.UTILS && typeof W.UTILS.parsePoints === 'function') ? W.UTILS.parsePoints(pts) : pts.trim().split(/\s+|,/).map(Number).filter(n => !Number.isNaN(n));
                if (nums.length < 2) return;
                ctx.beginPath();
                ctx.moveTo(nums[0], nums[1]);
                for (let i = 2; i < nums.length; i += 2) ctx.lineTo(nums[i], nums[i + 1]);
                if (tag === 'polygon') ctx.closePath();
                if (fill && fill !== 'none') { ctx.fillStyle = fill; ctx.fill(); }
                if (stroke && stroke !== 'none') { ctx.lineWidth = strokeWidth; ctx.strokeStyle = stroke; ctx.stroke(); }
            } else {
                // unsupported element
                // recurse into children to catch nested shapes
                Array.from(el.children || []).forEach(child => drawElement(child));
            }
        }

        // draw direct children of the svg
        Array.from(svg.children || []).forEach(child => drawElement(child));

        ctx.restore();
    }

    // Export the minimal API under W.MAFFIE so other modules can call these functions
    W.MAFFIE = {
        // internal storage for the last SVG text (owned by the MAFFIE API)
        _lastSvgText: null,
        resizeMainCanvas: resizeMainCanvas,
        drawSvgOnCanvas: drawSvgOnCanvas,
        setLastSvg(text) { this._lastSvgText = text; },
        getLastSvg() { return this._lastSvgText; }
    };

})();
