FROM node:26.12.1-alpine AS pruner
WORKDIR /repo
COPY . .
RUN TURBO_VERSION="$(node -p "require('./package.json').devDependencies.turbo.replace(/^\D+/, '')")" \
  && npx -y "turbo@${TURBO_VERSION}" prune admin --docker

FROM node:26.12.1-alpine
RUN npm install -g pnpm@12.16.1
WORKDIR /repo

COPY --from=pruner /repo/out/json/ ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY --from=pruner /repo/out/full/ ./

EXPOSE 5174

CMD ["pnpm", "turbo", "dev", "--filter=admin", "--", "--host", "0.0.0.0"]
