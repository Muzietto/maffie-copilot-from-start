from playwright.sync_api import sync_playwright
import time
import os
from PIL import Image
import sys

OUT = 'tools/smoke_screenshot.png'
URL = 'http://localhost:8080/'

console_msgs = []

with sync_playwright() as p:
  browser = p.chromium.launch(headless=True)
  context = browser.new_context(viewport={"width": 1200, "height": 800})
  page = context.new_page()

  def on_console(msg):
    try:
      console_msgs.append(f"{msg.type}: {msg.text}")
    except Exception as e:
      console_msgs.append(f"console callback error: {e}")

  page.on('console', on_console)

  print('navigating to', URL)
  page.goto(URL, wait_until='networkidle', timeout=15000)

  # wait for thumbnails to appear
  page.wait_for_selector('.thumb', timeout=5000)

  # click first thumbnail
  print('clicking first thumbnail')
  page.click('.thumb')
  # give the canvas some time to draw
  time.sleep(0.5)

  # resize viewport to force redraw
  print('resizing viewport to 800x600')
  page.set_viewport_size({'width': 800, 'height': 600})
  time.sleep(0.5)

  # capture screenshot
  os.makedirs(os.path.dirname(OUT), exist_ok=True)
  page.screenshot(path=OUT, full_page=False)
  print('screenshot saved to', OUT)

  # open screenshot and assert center pixel is not near-white
  try:
    im = Image.open(OUT).convert('RGBA')
    w, h = im.size
    cx, cy = w // 2, h // 2
    r, g, b, a = im.getpixel((cx, cy))
    print(f'center pixel at {cx},{cy}: rgba=({r},{g},{b},{a})')
    # consider near-white as white: all channels > 240
    if a != 0 and (r <= 240 or g <= 240 or b <= 240):
      print('ASSERTION PASSED: center pixel is not near-white')
      assertion_passed = True
    else:
      print('ASSERTION FAILED: center pixel is near-white or transparent')
      assertion_passed = False
  except Exception as e:
    print('ERROR inspecting screenshot:', e)
    assertion_passed = False

  # print console messages
  print('\nConsole messages:')
  for m in console_msgs:
    print(m)
  browser.close()

  if not assertion_passed:
    print('\nSmoke test RESULT: FAIL')
    sys.exit(2)

print('Smoke test RESULT: PASS')
