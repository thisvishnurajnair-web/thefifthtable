"""Compatibility launcher for the local preview, now including the photo admin API."""
import os
from pathlib import Path

if __name__ == '__main__':
    os.execvp('node', ['node', str(Path(__file__).with_name('preview.mjs'))])
