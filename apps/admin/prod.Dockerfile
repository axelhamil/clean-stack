FROM node:26.12.1-alpine AS pruner
WORKDIR /repo
COPY . .
RUN TURBO_VERSION="$(node -p "require('./package.json').devDependencies.turbo.replace(/^\D+/, '')")" \
  && npx -y "turbo@${TURBO_VERSION}" prune admin --docker

FROM node:26.12.1-alpine AS builder
RUN npm install -g pnpm@12.16.1
WORKDIR /repo

COPY --from=pruner /repo/out/json/ ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY --from=pruner /repo/out/full/ ./

ARG VITE_API_URL
ARG VITE_APP_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_APP_URL=${VITE_APP_URL}
RUN test -n "$VITE_API_URL" || (echo "ERROR: --build-arg VITE_API_URL is required (e.g. https://api.example.com)" && exit 1)
RUN test -n "$VITE_APP_URL" || (echo "ERROR: --build-arg VITE_APP_URL is required (e.g. https://app.example.com)" && exit 1)

ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_ENVIRONMENT
ARG VITE_GIT_SHA
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
ENV VITE_SENTRY_ENVIRONMENT=${VITE_SENTRY_ENVIRONMENT}
ENV VITE_GIT_SHA=${VITE_GIT_SHA}

RUN pnpm --filter admin exec vite build

FROM caddy:2.11-alpine AS runner
RUN apk add --no-cache wget
COPY apps/admin/Caddyfile /etc/caddy/Caddyfile
COPY infra/caddy/static-site.caddy /etc/caddy/static-site.caddy
COPY --from=builder /repo/apps/admin/dist /srv

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-80}/health" || exit 1

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
