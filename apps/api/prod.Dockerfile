FROM node:24.15.0-alpine AS pruner
WORKDIR /repo
COPY . .
RUN npx -y turbo@2.9.6 prune api --docker

FROM oven/bun:1.3.6-alpine AS runner
RUN apk add --no-cache wget nodejs npm
RUN npm install -g pnpm@10.33.2

WORKDIR /repo

COPY --from=pruner /repo/out/json/ ./
RUN pnpm install --frozen-lockfile --ignore-scripts --prod

COPY --from=pruner /repo/out/full/ ./

ENV MIGRATIONS_FOLDER=/repo/packages/drizzle/migrations
ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-3000}/livez" || exit 1

CMD ["sh", "-c", "bun apps/api/src/migrate.ts && bun apps/api/src/index.ts"]
