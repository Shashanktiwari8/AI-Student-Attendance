#!/usr/bin/env bash
# Build script for Render.com deployment
# This avoids the dlib compilation crash on free tier (512MB RAM)
set -o errexit

echo "--- Step 1: Upgrading pip ---"
pip install --upgrade pip setuptools wheel

echo "--- Step 2: Installing pre-compiled dlib-bin (no C++ compilation needed) ---"
pip install dlib-bin

echo "--- Step 3: Installing all other dependencies ---"
pip install -r requirements.txt

echo "--- Step 4: Installing face-recognition WITHOUT dlib dependency (dlib-bin already provides it) ---"
pip install face-recognition --no-deps

echo "--- Build completed successfully! ---"
