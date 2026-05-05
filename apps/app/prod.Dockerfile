FROM node:24.15.0-alpine AS pruner
WORKDIR /repo
COPY . .
RUN npx -y turbo@2.9.6 prune app --docker

FROM node:24.15.0-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo

COPY --from=pruner /repo/out/json/ ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY --from=pruner /repo/out/full/ ./

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN test -n "$VITE_API_URL" || (echo "ERROR: --build-arg VITE_API_URL is required (e.g. https://api.example.com)" && exit 1)

RUN pnpm --filter "@packages/*" run build
RUN pnpm --filter app exec vite build

FROM caddy:2.11-alpine AS runner
COPY apps/app/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /repo/apps/app/dist /srv

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-80}/health" || exit 1

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
