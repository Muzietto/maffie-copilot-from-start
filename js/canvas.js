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

    // Draw an optional background image (scaled to fill) onto the provided canvas.
    function drawBackgroundOnCanvas(canvas) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const bg = (W.MAFFIE && W.MAFFIE._bgImage) ? W.MAFFIE._bgImage : null;
        if (!bg) return;
        // image may be an HTMLImageElement or ImageBitmap
        const imgW = bg.naturalWidth || bg.width || 0;
        const imgH = bg.naturalHeight || bg.height || 0;
        if (!imgW || !imgH) return;
        // scale to cover (fill) the canvas, then apply user scaler (percent)
        const coverScale = Math.max(canvas.width / imgW, canvas.height / imgH);
        let userScale = 1;
        try {
            const slider = D.getElementById('additional-image-scaler');
            if (slider && slider.value) userScale = Number(slider.value) / 100;
        } catch (e) {
            userScale = 1;
        }
        const scale = coverScale * userScale;
        const dw = imgW * scale;
        const dh = imgH * scale;
        const dx = (canvas.width - dw) / 2;
        const dy = (canvas.height - dh) / 2;
        try {
            ctx.save();
            ctx.drawImage(bg, dx, dy, dw, dh);
            ctx.restore();
        } catch (e) {
            console.warn('Failed to draw background image:', e);
        }
    }

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
        // clear canvas and draw optional background image
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackgroundOnCanvas(canvas);

        // compute scaling to fit svg into canvas while preserving aspect
        const sx = canvas.width / svgW;
        const sy = canvas.height / svgH;
        const scale = Math.min(sx, sy);
        const tx = (canvas.width - svgW * scale) / 2;
        const ty = (canvas.height - svgH * scale) / 2;

        // Try a raster approach first: render the SVG into an offscreen Image
        // and draw it onto the canvas. This preserves fills, gradients,
        // filters and other paint servers that are hard to replicate via
        // Path2D. If this fails (older browsers / security restrictions),
        // fall back to the vector element-by-element drawing below.
        try {
            const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);
            await new Promise((resolve, reject) => {
                const img = new Image();
                // blob URLs are same-origin so no crossOrigin required
                img.onload = () => {
                    try {
                        // compute destination rectangle in pixel coordinates
                        const destW = svgW * scale;
                        const destH = svgH * scale;
                        const destX = tx;
                        const destY = ty;
                        // draw the rasterized SVG onto the canvas (on top of background)
                        ctx.save();
                        ctx.drawImage(img, destX, destY, destW, destH);
                        ctx.restore();
                        resolve();
                    } catch (e) {
                        reject(e);
                    } finally {
                        URL.revokeObjectURL(url);
                    }
                };
                img.onerror = (ev) => {
                    URL.revokeObjectURL(url);
                    reject(new Error('Failed to load rasterized SVG image'));
                };
                img.src = url;
            });
            // successfully drawn via drawImage; we're done
            return;
        } catch (e) {
            console.warn('Raster drawImage approach failed, falling back to vector draw:', e);
        }

        ctx.save();
        ctx.translate(tx, ty);
        ctx.scale(scale, scale);

        // recursive draw for supported elements
        function drawElement(el) {
            const tag = el.tagName && el.tagName.toLowerCase();
            if (!tag) return;
            // Resolve presentation attributes with inheritance: check the element
            // and walk up parent nodes to find the first occurrence of the
            // property (fill, stroke, stroke-width, color, etc.). This covers
            // cases where SVGs rely on inherited values or `currentColor`.
            function getInheritedProp(node, name) {
                let cur = node;
                const re = new RegExp(name.replace(/[-\\[]/g, '\\$&') + '\\s*:\\s*([^;]+)');
                while (cur && cur.nodeType === 1) {
                    const attr = cur.getAttribute(name);
                    if (attr && attr.trim() !== '') return attr.trim();
                    const style = cur.getAttribute('style');
                    if (style) {
                        const m = style.match(re);
                        if (m && m[1]) return m[1].trim();
                    }
                    cur = cur.parentElement;
                }
                return null;
            }

            let fill = getInheritedProp(el, 'fill');
            // Support `currentColor` which inherits the `color` property
            if (fill === 'currentColor' || fill === 'currentcolor') {
                const col = getInheritedProp(el, 'color');
                if (col) fill = col;
            }
            // Fallback to 'black' for compatibility with previous behavior
            if (!fill) fill = 'black';

            let stroke = getInheritedProp(el, 'stroke');
            if (stroke === 'currentColor' || stroke === 'currentcolor') {
                const col = getInheritedProp(el, 'color');
                if (col) stroke = col;
            }

            let strokeWidth = getInheritedProp(el, 'stroke-width');
            strokeWidth = parseFloat(strokeWidth || '1') || 1;

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
        // optional background image (HTMLImageElement or ImageBitmap)
        _bgImage: null,
        resizeMainCanvas: resizeMainCanvas,
        drawSvgOnCanvas: drawSvgOnCanvas,
        setLastSvg(text) { this._lastSvgText = text; },
        getLastSvg() { return this._lastSvgText; }
    };

    // Redraw helper used by multiple controls: draws background (if any)
    // and/or the last SVG onto the main canvas.
    function redrawCanvas() {
        const canvas = D.getElementById('main-canvas');
        const last = (W.MAFFIE && typeof W.MAFFIE.getLastSvg === 'function') ? W.MAFFIE.getLastSvg() : null;
        if (!canvas) return;
        if (last) {
            drawSvgOnCanvas(last, canvas);
        } else {
            resizeMainCanvas();
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawBackgroundOnCanvas(canvas);
        }
    }

    // Wire the 'Immagine Addizionale' file input to load an image and set it
    // as the canvas background (scaled to fill). This runs after MAFFIE is
    // exported so we can store the loaded image on W.MAFFIE._bgImage.
    (function wireAdditionalImageInput() {
        const input = D.getElementById('additional-image-input');
        const btn = D.getElementById('clear-additional-image');
        if (!input) return;
        // initialize button disabled state
        // initialize button and slider disabled state
        const slider = D.getElementById('additional-image-scaler');
        if (btn) {
            try {
                btn.disabled = !(W.MAFFIE && W.MAFFIE._bgImage);
            } catch (e) {
                btn.disabled = true;
            }
        }
        if (slider) {
            try {
                slider.disabled = !(W.MAFFIE && W.MAFFIE._bgImage);
            } catch (e) {
                slider.disabled = true;
            }
        }
        // use shared redraw helper
        // (redrawCanvas is defined below the MAFFIE export)

        input.addEventListener('change', (ev) => {
            const file = (ev.target && ev.target.files && ev.target.files[0]) || null;
            if (!file) {
                if (W.MAFFIE) W.MAFFIE._bgImage = null;
                if (btn) btn.disabled = true;
                if (slider) slider.disabled = true;
                redrawCanvas();
                return;
            }

            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                // store image and redraw
                if (W.MAFFIE) W.MAFFIE._bgImage = img;
                if (btn) btn.disabled = false;
                if (slider) slider.disabled = false;
                redrawCanvas();
                // release blob URL; keep image in memory
                URL.revokeObjectURL(url);
            };
            img.onerror = (e) => {
                console.error('Failed to load additional image:', e);
                URL.revokeObjectURL(url);
            };
            img.src = url;
        });

        if (btn) {
            btn.addEventListener('click', () => {
                // clear input, remove background and redraw
                try { input.value = ''; } catch (e) { /* ignore */ }
                if (W.MAFFIE) W.MAFFIE._bgImage = null;
                btn.disabled = true;
                if (slider) slider.disabled = true;
                redrawCanvas();
            });
        }
    })();

    // Wire the slider to redraw the canvas in real time as the user moves it.
    (function wireScaler() {
        const slider = D.getElementById('additional-image-scaler');
        if (!slider) return;
        slider.addEventListener('input', () => {
            // live update background scale
            redrawCanvas();
        });
    })();

    // Wire the download button to export the main canvas as a PNG and trigger
    // a download. The browser controls the destination; we provide a filename
    // so most browsers will save to the user's Downloads folder (or ask).
    (function wireDownloadButton() {
        const btn = D.getElementById('download-canvas');
        if (!btn) return;
        btn.addEventListener('click', () => {
            const canvas = D.getElementById('main-canvas');
            if (!canvas) return;
            // ensure canvas buffer matches display size
            resizeMainCanvas();
            // prefer toBlob for binary download
            if (canvas.toBlob) {
                canvas.toBlob((blob) => {
                    if (!blob) {
                        console.error('Failed to create image blob');
                        return;
                    }
                    const url = URL.createObjectURL(blob);
                    const a = D.createElement('a');
                    a.href = url;
                    const name = `maffie_canvas_${Date.now()}.png`;
                    a.download = name;
                    // append to DOM to make click work in some browsers
                    D.body.appendChild(a);
                    a.click();
                    a.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 1500);
                }, 'image/png');
            } else {
                // fallback: data URL
                try {
                    const data = canvas.toDataURL('image/png');
                    const a = D.createElement('a');
                    a.href = data;
                    a.download = `maffie_canvas_${Date.now()}.png`;
                    D.body.appendChild(a);
                    a.click();
                    a.remove();
                } catch (e) {
                    console.error('Failed to export canvas image:', e);
                }
            }
        });
    })();

})();
