# Yates Repository – Agent Field Notes

> **Meta note**: This is the primary agent guidance file for this repo. If you learn something that will help future tasks, update `AGENTS.md` directly.

## Repository scope

- **Project**: `@cerebruminc/yates`
- **Purpose**: RBAC/ability filtering for Prisma by injecting model-operation filters into Prisma queries.
- **Core model**: abilities are OR-ed per model+operation, then AND-ed with user query constraints.
- **Language/tooling**: TypeScript + Prisma + Jest + Biome.

## Workspace layout

- `src/index.ts` — primary runtime implementation (query interception, filter merge, nested write checks).
- `src/expressions.ts` / `src/ast-fragments.ts` — expression/runtime typing helpers.
- `test/integration/*` — integration behavior and regression coverage.
- `prisma/primary` and `prisma/secondary` — schemas and generated clients used in tests.
- `README.md` — user-facing behavior, tradeoffs, and limitations.
- `MIGRATION.md` — migration notes across Yates versions.

## Build, lint, test

- Install: `npm install`
- Lint: `npm run lint`
- Fix lint: `npm run lint:fix`
- Typecheck: `npm run test:types`
- Integration tests: `npm run test:integration`
- Build: `npm run build`

## Local development database

Use Docker Postgres on port `5666`:

- Start: `docker compose up -d db`
- Stop: `docker compose down`
- Initialize schemas:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5666/yates" \
DATABASE_URL_2="postgresql://postgres:postgres@localhost:5666/yates_2" \
npm run setup
```

## Commit messages

Use Conventional Commits for all commit titles:

- `type(scope?): subject`
- Examples:
  - `feat(api): add ability filters`
  - `fix: handle create checks`

## Testing workflow expectations

- Prefer focused tests first (target only affected integration areas).
- Always run `npm run test:types` before finalizing changes.
- For permission logic changes, add/adjust integration tests under `test/integration`.
- If DB-backed tests cannot run in your environment, explicitly call that out in your final report.

## Auth model implementation notes

- Reads are enforced by merging ability filters into query `where`.
- Writes may require preflight checks (e.g. create data matching, record existence checks under ability constraints).
- Nested write authorization is part of the security boundary; when changing nested behavior (`create`, `update`, `delete`, `upsert`, `connect`, etc.), treat it as security-sensitive and cover with integration tests.

## Change hygiene

- Keep fixes narrow and backward-compatible unless the task explicitly calls for broader refactors.
- Avoid opportunistic rewrites in permission-critical code.
- Update `README.md` when externally visible behavior changes.