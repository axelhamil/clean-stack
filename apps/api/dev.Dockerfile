FROM node:26.13.0-alpine AS pruner
WORKDIR /repo
COPY . .
RUN TURBO_VERSION="$(node -p "require('./package.json').devDependencies.turbo.replace(/^\D+/, '')")" \
  && npx -y "turbo@${TURBO_VERSION}" prune api --docker

FROM node:26.13.0-alpine
COPY --from=oven/bun:1.4.4-alpine /usr/local/bin/bun /usr/local/bin/bun
RUN npm install -g pnpm@12.16.1
WORKDIR /repo

COPY --from=pruner /repo/out/json/ ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY --from=pruner /repo/out/full/ ./

EXPOSE 3000

ENV MIGRATIONS_FOLDER=packages/drizzle/migrations

CMD ["sh", "-c", "bun apps/api/src/migrate.ts && pnpm turbo dev --filter=api"]
