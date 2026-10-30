# staff-ui rules

Temporary package: it exists only while both `apps/admin` and `apps/app` hold admin screens, and goes back into `apps/admin` in lot 7, when `apps/app` loses them. Forms and panels built from `@packages/ui` and fed by props. Auto-loaded under `packages/staff-ui/`. Cross-cutting rules: `/CLAUDE.md`.

## Rules

1. **Data and side effects arrive as props.** No api client, no router, no query here. **Why**: each app owns its typed client and its navigation, so one composite serves both without a dependency on either.
2. **The `admin` i18n namespace is part of the contract.** Every composite reads its copy from it, so a consuming app must load that namespace. **Why**: without it the labels render as raw keys with no error.
