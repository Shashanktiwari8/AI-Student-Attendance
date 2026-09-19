#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "--- Installing pre-compiled dlib-bin to prevent memory crash ---"
pip install --upgrade pip setuptools wheel
pip install dlib-bin

echo "--- Installing project dependencies ---"
pip install -r requirements.txt

echo "--- Build completed successfully! ---"
