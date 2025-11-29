# maffie-copilot-from-start

A small demo that loads SVG thumbnails from `svgs/`, draws the selected SVG into a main `<canvas>` and redraws on resize. Code is organized into `css/` and `js/` with a minimal public API exported as `MAFFIE`.

## Quick manual verification

Follow these steps to verify the app works locally (PowerShell on Windows):

1. Start a simple HTTP server from the repo root (if you don't already have one running on port 8080):

```powershell
cd 'c:\Users\marco\github\maffie-copilot-from-start'
# Python 3's built-in server
python -m http.server 8080
```

2. Open the app in your browser:

```powershell
Start-Process 'http://localhost:8080/'
```

3. Manual checks to perform in the browser:

- The left column should show thumbnail images (`.thumb`). Hovering should show the pointer cursor.
- Click a thumbnail. The page should log a message like "You clicked <name>" in the browser console and the main canvas should display the SVG.
- The clicked thumbnail should get the `.selected` style: a thicker border (8px) and a light grey background (`#eee`).
- Resize the browser window (or use the devtools responsive toolbar). After resize the canvas must redraw the SVG and maintain the inner `8px` padding so the drawing doesn't touch the canvas border.

4. Files and APIs of interest:

- `index.html` — main UI shell; loads `css/style.css`, `js/globals.js`, `js/utils.js`, `js/canvas.js`, `js/thumbnails.js` (note: `js/globals.js` and `js/utils.js` must load before other scripts).
- `css/style.css` — layout and styles for thumbnails and canvas.
- `js/globals.js` — defines `var W = window; var D = document;` and must be loaded before other scripts.
- `js/canvas.js` — encapsulated in an IIFE and exposes `window.MAFFIE` with methods:
	- `MAFFIE.resizeMainCanvas()` — syncs canvas backing store to displayed size (accounts for padding)
	- `MAFFIE.drawSvgOnCanvas(svgText, canvas)` — parses and draws SVG primitives onto the canvas
	- `MAFFIE.setLastSvg(text)` / `MAFFIE.getLastSvg()` — internal last-loaded SVG accessors
- `js/thumbnails.js` — wires thumbnail clicks and calls `MAFFIE` to draw the selected SVG.

- `js/utils.js` — small shared helpers exported on `W.UTILS` (loaded before other scripts):
	- `W.UTILS.debounce(fn, wait)` — debounce helper used for resize/image-load throttling.
	- `W.UTILS.parsePoints(str)` — parses SVG point lists for polyline/polygon rendering.

## Automated smoke test (optional)

An automated smoke test lives at `tools/smoke_playwright.py`. It does the following:

- Navigates to `http://localhost:8080/` (requires an HTTP server)
- Clicks the first thumbnail
- Resizes the viewport to 800×600 to force a redraw
- Saves a screenshot to `tools/smoke_screenshot.png`
- Asserts the center pixel is not near-white (basic content check)

To run the smoke test locally you need Playwright installed and browser binaries downloaded. On Windows (PowerShell):

```powershell
# install Playwright Python package (if not installed)
python -m pip install playwright
# download browsers
python -m playwright install
# run the smoke test (assumes a server on port 8080)
python tools\smoke_playwright.py
```

The script will exit with non-zero status if the center-pixel assertion fails and will save the screenshot to `tools/smoke_screenshot.png`.

## Troubleshooting

- If thumbnails don't load, make sure you served the repo over HTTP (fetch() needs an origin). Running `python -m http.server` from the repo root is a quick way to serve static files.
- If Playwright fails to launch a browser, run `python -m playwright install` to ensure browser binaries are installed.

## Notes

- The code intentionally exposes a tiny global API `MAFFIE` to decouple the thumbnail code from the rendering internals.
- If you want automated CI coverage of the smoke test, I can add a small test runner and CI job next.
