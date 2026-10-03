FROM python:3.10-slim

ENV PYTHONUNBUFFERED=1

# Install basic system dependencies for OpenCV and image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Upgrade pip
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Install dependencies from requirements.txt
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r ./backend/requirements.txt

# Install face-recognition without pulling raw dlib (dlib-bin is already installed)
RUN pip install --no-cache-dir face-recognition --no-deps

# Copy backend and frontend source files
COPY backend ./backend
COPY frontend ./frontend

WORKDIR /app/backend

ENV PORT=8000
EXPOSE 8000

# Start Uvicorn ASGI Server
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
