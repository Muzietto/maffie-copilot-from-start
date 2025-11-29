#!/usr/bin/env python3
"""
Fix leading indentation for only frontend files: .html, .css, .js
Replaces each leading group of 4 spaces with 2 spaces until none remain.
Usage: python tools/fix_frontend_indentation.py
"""
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
EXTS = {'.html', '.css', '.js'}

changed = []
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
        orig = text
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

print('Files modified:', len(changed))
for p in changed:
    print('  -', os.path.relpath(p, ROOT))

# verification
pattern = re.compile(r'(?m)^ {4}')
remains = []
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
            remains.append(path)

print('Files still containing lines that start with 4 spaces:', len(remains))
if remains:
    for p in remains:
        print('  -', os.path.relpath(p, ROOT))
else:
    print('VERIFICATION PASS: no remaining leading-4-space lines found in .html/.css/.js')
