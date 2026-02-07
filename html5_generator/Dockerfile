FROM node:20-slim AS base

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates \
    && pip3 install --break-system-packages --no-cache-dir uv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

FROM base AS deps
COPY package*.json ./
COPY pyproject.toml uv.lock ./
COPY prisma ./prisma/

RUN npm ci
RUN uv sync --no-dev
RUN npx prisma generate

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

COPY bot_py ./bot_py
COPY templates ./templates
COPY assets ./assets
COPY library ./library
COPY data ./data

RUN npm prune --omit=dev \
    && mkdir -p previews sessions temp logs

FROM base AS runtime
ENV PYTHONUNBUFFERED=1

COPY package*.json ./
COPY pyproject.toml uv.lock ./
COPY prisma ./prisma/

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.venv ./.venv
COPY --from=build /app/dist ./dist
COPY --from=build /app/bot_py ./bot_py
COPY --from=build /app/templates ./templates
COPY --from=build /app/assets ./assets
COPY --from=build /app/library ./library
COPY --from=build /app/data ./data
COPY --from=build /app/previews ./previews
COPY --from=build /app/sessions ./sessions
COPY --from=build /app/temp ./temp
COPY --from=build /app/logs ./logs

RUN groupadd -r app \
    && useradd --no-log-init -r -g app app \
    && chown -R app:app /app

USER app
CMD ["/app/.venv/bin/python", "-m", "bot_py.main"]
