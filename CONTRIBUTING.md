# Contributing

Thanks for stopping by. The flow is short: talk first, code second.

## How it works

**Small fix** (bug, typo, docs, test): fork, branch off `dev`, open a pull request into `dev`. A maintainer reviews it and adds the `accepted` label.

**Bigger change** (feature, integration, architecture):

1. **Open an issue** with a template.
2. **Wait for the `accepted` label.** It means "go for it". Don't start coding before, it would be a shame to throw your work away.
3. **Fork and branch off `dev`**, name it as you like (`fix/123-short-name` is nice, not required).
4. **Open your pull request into `dev`** with `Closes #<issue>` in the body. GitHub links it to the issue and closes the issue on merge.

The `PR policy` check turns green once `accepted` is on the pull request or on its linked issue. `main` only receives the release from `dev`, done by the maintainer.

## Before you push

```bash
mise install && pnpm install && pnpm bootstrap
docker compose up postgres -d && pnpm db:migrate
pnpm dev
```

The `pre-push` hook runs every check (Biome, types, tests, duplication, unused code). If it's green, you're good. Never skip it with `--no-verify`.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/), lowercase subject: `fix(email): retry after a provider timeout`.

The architecture rules live in the [`CLAUDE.md`](CLAUDE.md) files, one per app and package. Read the one for the area you touch.

## What fits

- Yes: fixes, hardening, performance, docs, tests, tooling, better plumbing.
- No: business features (the boilerplate stays domain-free) and provider adapters nobody asked for. Providers are picked by the maintainer: suggest one with the integration template.

## Security

Never in a public issue. See [`SECURITY.md`](SECURITY.md).
