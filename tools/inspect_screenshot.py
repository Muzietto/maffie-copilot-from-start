from PIL import Image, ImageStat
import sys
import os

path = os.path.join('tools', 'smoke_screenshot.png')
if not os.path.exists(path):
    print('ERROR: screenshot not found at', path)
    sys.exit(2)

# Try to open image
im = Image.open(path).convert('RGBA')
width, height = im.size
pixels = im.getdata()

# Count non-white or non-transparent pixels
non_white = 0
for (r, g, b, a) in pixels:
    if a == 0:
        continue
    # consider near-white as white
    if not (r > 240 and g > 240 and b > 240):
        non_white += 1

total = width * height
percent_non_white = non_white / total * 100

# compute bounding box of non-white pixels
bbox = None
px = im.load()
minx, miny = width, height
maxx, maxy = 0, 0
for y in range(height):
    for x in range(width):
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        if not (r > 240 and g > 240 and b > 240):
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y

if minx <= maxx and miny <= maxy:
    bbox = (minx, miny, maxx, maxy)
else:
    bbox = None

# basic color statistics
stat = ImageStat.Stat(im)
mean = stat.mean[:3]
median = stat.median[:3] if hasattr(stat, 'median') else None

print('path:', path)
print('size:', width, 'x', height)
print('mode:', im.mode)
print('total_pixels:', total)
print('non_white_pixels:', non_white)
print('percent_non_white: {:.3f}%'.format(percent_non_white))
print('bounding_box_non_white:', bbox)
print('mean_rgb: {:.1f}, {:.1f}, {:.1f}'.format(*mean))
if median:
    print('median_rgb: {}'.format(median))

# sample center pixel and a few coords
coords = [ (width//2, height//2), (10,10), (width-10,10), (10,height-10), (width-10,height-10) ]
for (x,y) in coords:
    r,g,b,a = px[x,y]
    print(f'pixel {x},{y}: rgba=({r},{g},{b},{a})')

print('done')
