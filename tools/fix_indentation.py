#!/usr/bin/env python3
"""
Fix leading indentation: replace leading groups of 4 spaces with 2 spaces across text files.
Usage: python tools/fix_indentation.py
Prints files modified and a summary.
"""
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
EXTS = {'.html', '.css', '.js', '.py', '.md', '.svg', '.txt'}

changed = []

for dirpath, dirnames, filenames in os.walk(ROOT):
    # skip .git and node_modules if present
    if '.git' in dirpath.split(os.sep):
        continue
    for fn in filenames:
        path = os.path.join(dirpath, fn)
        _, ext = os.path.splitext(fn)
        if ext.lower() not in EXTS:
            continue
        try:
            with open(path, 'r', encoding='utf-8') as f:
                text = f.read()
        except Exception:
            # skip non-text files
            continue
        orig = text
        # repeatedly replace a single leading group of 4 spaces at start of lines with 2 spaces
        while True:
            new = re.sub(r'(?m)^(?: {4})', '  ', text)
            if new == text:
                break
            text = new
        if text != orig:
            try:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(text)
                changed.append(path)
            except Exception as e:
                print('Failed to write', path, e)

print('Checked root:', ROOT)
print('Files modified:', len(changed))
for p in changed:
    print('  -', os.path.relpath(p, ROOT))

# final verification count
remains = 0
pattern = re.compile(r'(?m)^ {4}')
for dirpath, dirnames, filenames in os.walk(ROOT):
    if '.git' in dirpath.split(os.sep):
        continue
    for fn in filenames:
        path = os.path.join(dirpath, fn)
        _, ext = os.path.splitext(fn)
        if ext.lower() not in EXTS:
            continue
        try:
            with open(path, 'r', encoding='utf-8') as f:
                text = f.read()
        except Exception:
            continue
        if pattern.search(text):
            remains += 1
print('Files still containing lines that start with 4 spaces:', remains)
if remains == 0:
    print('VERIFICATION PASS: no remaining leading-4-space lines found')
else:
    print('VERIFICATION FAIL: run grep to inspect remaining matches')
