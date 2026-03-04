# Migration guide: v1 -> v2

This guide covers the upgrade from Yates v1 (RLS + role switching) to v2 (query-time ability filters).

## Summary of breaking changes

- **No RLS policies or DB role switching.** v2 injects ability filters directly into Prisma queries; you should remove RLS policies, database roles, and any `SET ROLE` wrappers used only for RLS.
- **Client extensions instead of middleware.** Yates now uses Prisma Client extensions. Apply any Prisma middleware **before** creating the Yates client.
- **Ability expressions are Prisma `where` filters.** Abilities for the same model + operation are OR-ed together, then AND-ed with your query.
- **Nested writes/reads are enforced recursively.** Ability filters are applied to nested CRUD operations as well.

## Step-by-step upgrade

These steps assume you already have a working Prisma + Yates setup; the focus here is on migrating away from RLS and into the new query-filter workflow.

### 1) Upgrade dependencies

Update Yates and Prisma to versions compatible with client extensions.

```bash
npm i @cerebruminc/yates@^2
npm i prisma @prisma/client
```

If you are on Prisma < 4.16.0, enable client extensions in your Prisma schema:

```prisma
generator client {
  provider        = "prisma-client-js"
  // previewFeatures = ["clientExtensions"]
}
```

### 2) Remove RLS policies and role switching

Remove database migrations and runtime code that were only needed for RLS:

- Drop RLS policies and role grants in your DB migrations.
- Remove any code that does `SET ROLE` or `SET LOCAL ROLE`.
- If you previously depended on DB roles per request, replace that logic with `getContext` (see next steps).

> v2 enforces permissions by modifying Prisma queries, so no database role changes are required.

### 3) Update client setup (client extensions)

In v1, Yates was configured in conjunction with Prisma middleware/migrations. v2 now uses Prisma Client extensions, so any middleware must be applied before creating the Yates client.

```ts
import { PrismaClient } from "@prisma/client";
import { setup } from "@cerebruminc/yates";

const prisma = new PrismaClient();

// Apply Prisma middleware here if you use it.

const yates = await setup({
  prisma,
  getRoles: (abilities) => ({
    USER: [abilities.Post.read],
  }),
  getContext: () => ({
    role: "USER",
    context: {
      "user.id": "123",
    },
  }),
});
```

### 4) Rewrite ability expressions to Prisma `where`

In v2, `expression` is either a Prisma `where` object or a function that returns one. That filter is combined with the query.

Example: "read posts where authorId = current user"

```ts
customAbilities: {
  Post: {
    readOwnPosts: {
      description: "Read own posts",
      operation: "SELECT",
      expression: (_client, _row, context) => ({
        authorId: context("user.id") as string,
      }),
    },
  },
},
```

Example: using row references inside expressions

```ts
customAbilities: {
  User: {
    readWhereNameEqualsEmail: {
      description: "Read user when name equals email",
      operation: "SELECT",
      expression: (_client, row) => ({
        name: {
          equals: row("email"),
        },
      }),
    },
  },
},
```

Notes:

- Abilities for the same model + operation are **OR-ed** together.
- The final OR-ed filter is **AND-ed** with your original Prisma `where` clause.
- For `INSERT`, the expression is matched against the incoming `data` payload.
- Create checks currently do **not** support relation filters (only scalars + `AND`/`OR`/`NOT`).

## Before/after examples

### Example 1: Custom abilities shape change (role-scoped -> model-scoped)

Before (v1: custom abilities were attached to roles via the `customAbilities` callback; each role declared both which abilities it needed and their definitions):

```ts
const client = await setup({
  prisma,
  customAbilities: () => ({
    USER: {
      Post: {
        insertOwnPost: {
          description: "Insert own post",
          operation: "INSERT",
          expression: (client, row, context) => ({
            authorId: context("user.id"),
          }),
        },
      },
      User: {
        updateOwnUser: {
          description: "Update own user",
          operation: "UPDATE",
          expression: `current_setting('user.id') = "id"`,
        },
      },
    },
  }),
  getRoles: (abilities) => ({
    USER: [
      abilities.User.read,
      // These abilities came from the `customAbilities` map above in v1
    ],
  }),
  getContext: () => ({ role: "USER", context: { "user.id": currentUserId } }),
});
```

After (v2: abilities live under the `customAbilities` object once per model, and roles just reference the pre-built abilities):

```ts
const client = await setup({
  prisma,
  customAbilities: {
    Post: {
      insertOwnPost: {
        description: "Insert own post",
        operation: "INSERT",
        expression: (_client, _row, context) => ({
          authorId: context("user.id") as string,
        }),
      },
    },
    User: {
      updateOwnUser: {
        description: "Update own user",
        operation: "UPDATE",
        expression: (_client, _row, context) => ({
          id: context("user.id") as string,
        }),
      },
    },
  },
  getRoles: (abilities) => ({
    USER: [
      abilities.User.read,
      abilities.Post.insertOwnPost,
      abilities.User.updateOwnUser,
    ],
  }),
  getContext: () => ({ role: "USER", context: { "user.id": currentUserId } }),
});
```

### Example 2: Prisma query expression -> Prisma `where` expression

Before (v1: ability can return a Prisma query; RLS enforces via DB):

```ts
customAbilities: () => ({
  USER: {
    Comment: {
      deleteOnOwnPost: {
        description: "Delete comment on own post",
        operation: "DELETE",
        expression: (client, row, context) =>
          client.post.findFirst({
            where: {
              id: row("postId"),
              authorId: context("user.id"),
            },
          }),
      },
    },
  },
}),
```

After (v2: ability expresses a `where` filter directly):

```ts
customAbilities: {
  Comment: {
    deleteOnOwnPost: {
      description: "Delete comment on own post",
      operation: "DELETE",
      expression: (_client, _row, context) => ({
        post: {
          authorId: context("user.id") as string,
        },
      }),
    },
  },
},
```

### 5) Validate nested operations

Because v2 applies filters recursively, nested writes/reads must have appropriate abilities for each model involved. If a nested operation fails after the upgrade, ensure you have abilities defined for every model touched by that query.

## Quick checklist

- [ ] Remove RLS policies, roles, and migrations.
- [ ] Delete any role-switching statements (`SET ROLE`/`SET LOCAL ROLE`).
- [ ] Move Prisma middleware before `setup()`.
- [ ] Rewrite abilities as Prisma `where` expressions.
- [ ] Ensure nested queries have abilities on all involved models.
- [ ] Run tests to verify filters match previous behavior.
