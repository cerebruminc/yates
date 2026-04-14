# Migrating to Yates + Prisma 7

This guide covers migration from older Yates/Prisma combinations (typically Prisma 4/5) to the current Prisma 7-compatible Yates release.

## What changed

### Breaking changes

1. **Prisma 7 is now required**
   - `prisma` and `@prisma/client` should both be on the latest Prisma 7 line.

2. **Postgres driver adapter is required in Prisma Client setup**
   - Use `@prisma/adapter-pg` with `pg` when constructing your `PrismaClient`.

3. **Prisma middleware API is no longer the integration point**
   - If you used Prisma middleware-specific behavior around Yates, migrate that logic to Prisma Client query extensions.

4. **Error text may differ**
   - Some “not found” error messages changed wording in Prisma 7.
   - Prefer resilient assertions (`toThrow()`) over exact string matching where possible.

---

## 1) Upgrade dependencies

```bash
npm install prisma@^7 @prisma/client@^7 @prisma/adapter-pg pg
```

---

## 2) Update Prisma schema/config (Prisma 7 style)

In Prisma 7, datasource URL config moves to `prisma.config.ts`.

### Before (`schema.prisma`)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### After (`schema.prisma`)

```prisma
datasource db {
  provider = "postgresql"
}
```

### Add `prisma.config.ts`

```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

### Update scripts

```json
{
  "scripts": {
    "generate": "prisma generate --config prisma/prisma.config.ts",
    "migrate": "prisma migrate dev --config prisma/prisma.config.ts"
  }
}
```

If you have multiple schemas (multi-tenant/multi-db), create one config file per schema.

---

## 3) Update Prisma client construction

### Before

```ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
```

### After

```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  }),
});
```

For tests/CLI flows where Node should exit cleanly after idle DB work, you can enable:

```ts
allowExitOnIdle: true
```

inside the adapter config.

---

## 4) Keep Yates setup usage the same

Your `setup({ prisma, getRoles, getContext, ... })` API remains the same.

```ts
import { setup } from "@cerebruminc/yates";

const client = await setup({
  prisma,
  getRoles: (abilities) => ({
    USER: [abilities.Post.read],
  }),
  getContext: () => ({
    role: "USER",
    context: {
      "ctx.user_id": "...",
    },
  }),
});
```

To intentionally bypass Yates/RLS for a request path, return `null` from `getContext()`.

---

## 5) Transaction behavior notes

On Prisma 7, Yates supports nested interactive transaction behavior correctly (including outer rollback semantics).

If you previously had app-level workarounds for nested transactions, you can usually remove them after validating with your own integration tests.

---

## 6) Validation checklist

- [ ] `npm run generate`
- [ ] `npm run lint`
- [ ] `npm run test:types` (or `tsc --noEmit`)
- [ ] integration tests passing in a Postgres environment
- [ ] key authz/RLS paths manually smoke-tested

---

## Troubleshooting

### Raw query deserialization errors on system catalogs
If raw queries against `pg_catalog` fail in Prisma 7, avoid `SELECT *` and cast/select only needed columns to supported scalar types (`::text`, etc.).

### Exact not-found message assertions failing
Prisma 7 updated several not-found error message strings. Update tests to avoid brittle exact substring coupling unless required.

### Jest open-handle warnings in test suites
Ensure all Prisma clients are disconnected in teardown, and if needed set `allowExitOnIdle: true` in adapter config for test-created clients.
