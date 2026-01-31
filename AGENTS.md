# Repository Instructions

## Commit messages
Use Conventional Commits for all commit titles:

- `type(scope?): subject`
- Examples:
  - `feat(api): add ability filters`
  - `fix: handle create checks`

## Local development database
Use Docker Postgres on port 5666:

- Start: `docker compose up -d db`
- Stop: `docker compose down`
- Initialize schemas: `DATABASE_URL="postgresql://postgres:postgres@localhost:5666/yates" DATABASE_URL_2="postgresql://postgres:postgres@localhost:5666/yates_2" npm run setup`
