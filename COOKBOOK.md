# Yates Cookbook

Practical patterns for building authorization in Yates.

This guide focuses on:

- common **gating patterns**
- when to use each pattern
- **data modelling recommendations** that make policy easier and safer

---

## Mental model (quick refresher)

- Yates builds ability filters per model + operation.
- Abilities are OR-ed together for that model/operation.
- Result is AND-ed with the user query.

In short:

- **Reads** are filtered.
- **Writes** are validated with write-time checks.
- Nested writes are validated recursively.

---

## Pattern 1: Tenant / org scoping on reads

Use this when every record belongs to an org (or tenant).

```ts
customAbilities: {
  Post: {
    readOrgPosts: {
      description: "Read posts in current org",
      operation: "SELECT",
      expression: (_client, _row, context) => ({
        organizationId: context("org.id") as string,
      }),
    },
  },
}
```

**Why this is good:** simple, fast, and easy to reason about.

---

## Pattern 2: Ownership gating

Use this when users should only touch their own records.

```ts
customAbilities: {
  Post: {
    updateOwnPost: {
      description: "Update own post",
      operation: "UPDATE",
      expression: (_client, _row, context) => ({
        authorId: context("user.id") as string,
      }),
    },
    deleteOwnPost: {
      description: "Delete own post",
      operation: "DELETE",
      expression: (_client, _row, context) => ({
        authorId: context("user.id") as string,
      }),
    },
  },
}
```

---

## Pattern 3: Membership gating via join table (recommended)

Use a join model like `RoleAssignment` for org membership/roles.

```ts
customAbilities: {
  Organization: {
    readIfMember: {
      description: "Read org if user is a member",
      operation: "SELECT",
      expression: (_client, _row, context) => ({
        roleAssignment: {
          some: { userId: context("user.id") as string },
        },
      }),
    },
  },
}
```

This scales better than encoding roles directly on `User`.

---

## Pattern 4: Gate `connect` inside `create`

This is the common “create record + connect relation only if allowed target” case.

Example: allow user creation only when connected `roleAssignment` belongs to allowed org IDs.

```ts
customAbilities: {
  User: {
    createWithAllowedOrgs: {
      description: "Create users with allowed org connections",
      operation: "INSERT",
      expression: (_client, _row, context) => ({
        roleAssignment: {
          some: {
            organizationId: { in: context("org.ids") as string[] },
          },
        },
      }),
    },
  },
}
```

Then:

```ts
await client.user.create({
  data: {
    email: "new@example.com",
    roleAssignment: {
      connect: { id: assignmentId },
    },
  },
});
```

Yates evaluates create-time relation constraints from `data` (including `connect` / FK values where resolvable).

---

## Pattern 5: Gate `connect` / `set` / `disconnect` inside `update`

For update paths, Yates validates connect-style relation mutations against related-model `UPDATE` abilities.

Example ability:

```ts
customAbilities: {
  Post: {
    updateAllowedPosts: {
      description: "Only mutate allowed posts",
      operation: "UPDATE",
      expression: (_client, _row, context) => ({
        title: { in: context("post.titles") as string[] },
      }),
    },
  },
}
```

This gates nested updates like:

```ts
await client.user.update({
  where: { id: userId },
  data: {
    posts: {
      connect: [{ id: 1 }, { id: 2 }],
      // or set: [{ id: 1 }]
      // or disconnect: { id: 1 }
    },
  },
});
```

It also applies to:

- mixed `connect` arrays (must all be allowed)
- `set: []` on to-many (checks currently-related rows)
- `disconnect: true` on to-one (checks currently-related row)

---

## Pattern 6: Admin bypass

```ts
getRoles: (abilities) => ({
  ADMIN: "*",
  USER: [abilities.Post.read],
})
```

Use sparingly and only for trusted operator roles.

---

## Pattern 7: Soft-delete visibility

```ts
customAbilities: {
  Post: {
    readNotDeleted: {
      operation: "SELECT",
      expression: () => ({ deletedAt: null }),
    },
  },
}
```

---

## Data modelling recommendations

### 1) Prefer explicit join models for membership/roles

Use models like:

- `RoleAssignment(userId, organizationId, roleId)`

instead of hiding role/membership in app-only logic.

Benefits:

- easier ability expressions
- cleaner auditing
- better future extensibility (role metadata, timestamps, source)

### 2) Put tenant/org key on mutable business tables

If a row belongs to an org, include `organizationId` directly on that row (or a clear relation path).

This keeps expressions cheap and understandable.

### 3) Keep ownership fields immutable where possible

Fields like `authorId`, `organizationId`, `createdBy` are often policy anchors.

Changing these freely can create authorization edge cases.

### 4) Design for queryable policy anchors

Expressions are Prisma `where` objects, so policy is easiest when anchored on:

- scalar fields (`organizationId`, `authorId`, `status`)
- explicit relations (`roleAssignment.some(...)`)

### 5) Add useful unique constraints

If callers connect by non-ID fields (e.g. slug), enforce uniqueness at schema level.

### 6) Be explicit about relation mutation APIs

Remember:

- `connect` / `set` / `disconnect` are nested relation mutation tools.
- `createMany` / `updateMany` are not relation-connect APIs.

Keep app services aligned with supported Prisma write shapes.

### 7) Treat high-blast mutations as privileged

Operations like `set: []` and `disconnect: true` can detach many links quickly.

Even with Yates checks, consider service-layer guardrails (extra confirmation, domain-level invariant checks).

---

## Suggested role layout

A practical baseline:

- `ADMIN`: `"*"`
- `ORG_ADMIN`: scoped read/write abilities constrained by org membership
- `USER`: own-record + member-scoped reads
- `SERVICE`: narrow machine role with only required model operations

---

## Checklist when adding a new gated mutation

- [ ] Is the ability operation correct? (`SELECT`/`INSERT`/`UPDATE`/`DELETE`)
- [ ] Can expression be anchored on stable fields/relations?
- [ ] Are nested writes covered by integration tests?
- [ ] Are failure paths atomic (no partial side effects)?
- [ ] Does schema include constraints needed by your selectors?

---

If you add a new authorization pattern in code/tests, add a small example here too.