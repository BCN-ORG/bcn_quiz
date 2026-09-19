# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS prod-deps
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npm prune --omit=dev \
  && npx prisma generate \
  && npm cache clean --force

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json nest-cli.json tsconfig.json tsconfig.build.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nestjs \
  && useradd --system --uid 1001 --gid nestjs nestjs
COPY --chown=nestjs:nestjs package.json prisma.config.ts ./
COPY --chown=nestjs:nestjs --from=prod-deps /app/node_modules ./node_modules
COPY --chown=nestjs:nestjs --from=build /app/dist ./dist
COPY --chown=nestjs:nestjs --from=build /app/prisma ./prisma
COPY --chown=nestjs:nestjs --chmod=755 docker/entrypoint.sh /app/docker/entrypoint.sh
USER nestjs
EXPOSE 3001
ENTRYPOINT ["/app/docker/entrypoint.sh"]
