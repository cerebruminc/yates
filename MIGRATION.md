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

### Example 1: Ability expressions now describe Prisma `where` filters

Before (v1, see `test/integration/expressions.spec.ts`): ability expressions could return a Prisma query that the migration tool translated into SQL, e.g. checking for a tag label before an insert:

```ts
const label = "test-label";

customAbilities: {
  Post: {
    customCreateAbility: {
      description: "Allow creating posts when a specific tag exists",
      operation: "INSERT",
      expression: (client: PrismaClient) => {
        return client.tag.findFirst({
          where: {
            label,
          },
        });
      },
    },
  },
},
getRoles: (abilities) {
  return {
    USER: [abilities.Post.customCreateAbility, abilities.Post.read],
  };
},
```

After (v2): the same rule is expressed as a Prisma `where` clause, so there’s no translation step—Yates just merges the filter with the outgoing query:

```ts
const label = "test-label";

customAbilities: {
  Post: {
    customCreateAbility: {
      description: "Allow creating posts when a specific tag exists",
      operation: "INSERT",
      expression: () => ({
        tags: {
          some: {
            label,
          },
        },
      }),
    },
  },
},
getRoles: (abilities) {
  return {
    USER: [abilities.Post.customCreateAbility, abilities.Post.read],
  };
},
```

### Example 2: Expressing nested relations via Prisma `where`

Before (v1, similar to the failure cases in `test/integration/sanitation.spec.ts`): the ability returned a Prisma query that checked the related `Post` record via `client.post.findFirst`, because the RLS policies had to evaluate that query.

```ts
customAbilities: {
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
getRoles: (abilities) {
  return {
    USER: [abilities.Comment.deleteOnOwnPost, abilities.Comment.read],
  };
},
```

After (v2): the same nested check becomes a Prisma `where` clause. Yates injects it directly into the outgoing query, so there is no need to spin up a secondary query to compute the policy.

```ts
customAbilities: {
  Comment: {
    deleteOnOwnPost: {
      description: "Delete comment on own post",
      operation: "DELETE",
      expression: (_client, row, context) => ({
        post: {
          id: row("postId"),
          authorId: context("user.id") as string,
        },
      }),
    },
  },
},
getRoles: (abilities) {
  return {
    USER: [abilities.Comment.deleteOnOwnPost, abilities.Comment.read],
  };
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
