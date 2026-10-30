# staff-ui rules

Back-office composites used by both `apps/admin` and, until its admin screens go, `apps/app`: forms and panels built from `@packages/ui` and fed by props. Auto-loaded under `packages/staff-ui/`. Cross-cutting rules: `/CLAUDE.md`.

## Rules

1. **Data and side effects arrive as props.** No api client, no router, no query here. **Why**: each app owns its typed client and its navigation, so one composite serves both without a dependency on either.
