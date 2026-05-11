FROM node:24.15.0-alpine AS pruner
WORKDIR /repo
COPY . .
RUN npx -y turbo@2.9.6 prune api --docker

FROM node:24.15.0-alpine
COPY --from=oven/bun:1.3.6-alpine /usr/local/bin/bun /usr/local/bin/bun
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo

COPY --from=pruner /repo/out/json/ ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY --from=pruner /repo/out/full/ ./

RUN pnpm --filter "@packages/*" run build

EXPOSE 3000

ENV MIGRATIONS_FOLDER=packages/drizzle/migrations

CMD ["sh", "-c", "bun apps/api/src/migrate.ts && pnpm turbo dev --filter=api"]
