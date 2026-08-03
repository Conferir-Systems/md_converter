FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv \
    libgtk-3-0 libnss3 libasound2 libgbm1 libdrm2 libxss1 libxtst6 \
    libatspi2.0-0 libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libxkbcommon0 libpango-1.0-0 libcairo2 libcups2 \
    libgl1 libegl1 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY python/requirements.txt python/requirements.txt
RUN python3 -m venv python/.venv \
    && python/.venv/bin/pip install --no-cache-dir -r python/requirements.txt \
    && ln -s bin python/.venv/Scripts \
    && ln -s python3 python/.venv/bin/python.exe

COPY package.json package-lock.json ./
RUN npm ci && node node_modules/electron/install.js

COPY src src
COPY python/bridge.py python/bridge.py

ENV ELECTRON_OZONE_PLATFORM_HINT=auto

USER node

CMD ["npm", "start", "--", "--no-sandbox"]
