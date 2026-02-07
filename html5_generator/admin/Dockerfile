FROM node:20-slim AS base

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps

WORKDIR /app/admin
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate

FROM deps AS build
COPY . ./
RUN npm run build
RUN npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app/admin

COPY --from=build /app/admin/node_modules ./node_modules
COPY --from=build /app/admin/.next ./.next
COPY --from=build /app/admin/public ./public
COPY --from=build /app/admin/package*.json ./
COPY --from=build /app/admin/next.config.ts ./next.config.ts
COPY --from=build /app/admin/prisma ./prisma

RUN groupadd -r app \
    && useradd --no-log-init -r -g app app \
    && mkdir -p /app/data \
    && chown -R app:app /app

USER app
EXPOSE 3001
CMD ["npm", "run", "start"]
