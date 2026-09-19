#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "--- Installing pre-compiled dlib-bin to prevent memory crash ---"
pip install --upgrade pip setuptools wheel
pip install dlib-bin

echo "--- Installing project dependencies ---"
if [ -f "backend/requirements.txt" ]; then
    pip install -r backend/requirements.txt
else
    pip install -r requirements.txt
fi

echo "--- Build completed successfully! ---"
