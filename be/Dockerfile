FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl ca-certificates
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS prod-deps
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npm prune --omit=dev \
  && npx prisma generate \
  && npm cache clean --force

FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl ca-certificates
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json nest-cli.json tsconfig.json tsconfig.build.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl ca-certificates \
  && addgroup -S -g 1001 nestjs \
  && adduser -S -u 1001 -G nestjs nestjs
COPY --chown=nestjs:nestjs package.json prisma.config.ts ./
COPY --chown=nestjs:nestjs --from=prod-deps /app/node_modules ./node_modules
COPY --chown=nestjs:nestjs --from=build /app/dist ./dist
COPY --chown=nestjs:nestjs --from=build /app/prisma ./prisma
COPY --chown=nestjs:nestjs docker/entrypoint.sh /app/docker/entrypoint.sh
RUN chmod +x /app/docker/entrypoint.sh
USER nestjs
EXPOSE 3001
ENTRYPOINT ["/app/docker/entrypoint.sh"]
