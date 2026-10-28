FROM node:26.13.0-alpine AS pruner
WORKDIR /repo
COPY . .
RUN npx -y turbo@2.9.6 prune app --docker

FROM node:26.13.0-alpine
RUN npm install -g pnpm@12.16.1
WORKDIR /repo

COPY --from=pruner /repo/out/json/ ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY --from=pruner /repo/out/full/ ./

EXPOSE 5173

CMD ["pnpm", "turbo", "dev", "--filter=app", "--", "--host", "0.0.0.0"]
