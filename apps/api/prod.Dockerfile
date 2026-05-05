FROM node:24.15.0-alpine AS pruner
WORKDIR /repo
COPY . .
RUN npx -y turbo@2.9.6 prune api --docker

FROM node:24.15.0-alpine AS builder
COPY --from=oven/bun:1.3.6-alpine /usr/local/bin/bun /usr/local/bin/bun
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo

COPY --from=pruner /repo/out/json/ ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY --from=pruner /repo/out/full/ ./

RUN pnpm --filter "@packages/*" run build
RUN cd apps/api && bun build src/index.ts --outdir dist --target bun --minify

FROM oven/bun:1.3.6-alpine AS runner
WORKDIR /app

RUN apk add --no-cache wget

COPY --from=builder --chown=bun:bun /repo/apps/api/dist /app/dist

USER bun
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-3000}/health" || exit 1

# Migrations: not run inside the runtime container.
# On Railway, set the service "Pre-Deploy Command" to: pnpm db:migrate
# (drizzle-kit + migrations live in @packages/drizzle, kept out of the runner for image size).
CMD ["bun", "dist/index.js"]
