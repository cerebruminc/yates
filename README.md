<div align="center">
  <img width="200" height="200" src="https://raw.githubusercontent.com/cerebruminc/yates/master/images/yates-icon.png">

[![npm version](https://img.shields.io/npm/v/@cerebruminc/yates)](https://www.npmjs.com/package/@cerebruminc/yates)

  <h1>Yates = Prisma + Ability Filters</h1>

  <p>
    A module for implementing role-based access control with Prisma when using Postgres
  </p>
  <br>
</div>

> English: from Middle English _yates_ ‘gates’ plural of _yate_ Old English _geat_ ‘gate’ hence a topographic or occupational name for someone who lived by the gates of a town or castle and who probably acted as the gatekeeper or porter.

<br>

Yates is a module for implementing role-based access control with Prisma. It is designed to be used with the [Prisma Client](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client) and PostgreSQL. It applies role abilities directly to Prisma queries by injecting permission filters into the `where` clause and recursing through nested operations.

## Prerequisites

Yates requires the `prisma` package at version 4.9.0 or greater and the `@prisma/client` package at version 4.0.0 or greater. Additionally, it uses [Prisma Client extensions](https://www.prisma.io/docs/concepts/components/prisma-client/client-extensions) to apply ability filters (which require a preview feature flag until Prisma 4.16.0, so you might need to enable this feature in your Prisma schema):

```prisma
generator client {
  provider        = "prisma-client-js"
  // previewFeatures = ["clientExtensions"] // uncomment when using Prisma before 4.16.0 
}
```

## Installation

```bash
npm i @cerebruminc/yates
```

## Usage

Once you've installed Yates, you can use it in your Prisma project by importing it and calling the `setup` function. This function takes a Prisma Client instance and a configuration object as arguments and returns a client that can intercept all queries and apply the appropriate ability filters to them.

Yates uses [Prisma Client Extensions](https://www.prisma.io/docs/concepts/components/prisma-client/client-extensions) to apply ability filters to Prisma Client queries. This means that you can use the Prisma Client as you normally would, and Yates will automatically apply the appropriate filters to each query. It also means that you will need to apply your [Prisma Client middleware](https://www.prisma.io/docs/orm/prisma-client/client-extensions/middleware) _before_ creating the Yates client, as middleware cannot be applied to an extended client.

Client extensions share the same API as the Prisma Client, you can use the Yates client as a drop-in replacement for the Prisma Client in your application. They also share the same connection pool as the base client, which means that you can freely create new Yates clients with minimal performance impact.

The `setup` function will generate CRUD abilities for each model in your Prisma schema, as well as any additional abilities that you have defined in your configuration. It will then map those abilities to your user roles and apply the resulting filters to each Prisma query.

For Yates to be able to apply the correct abilities for each request, you must pass a function called `getContext` in the `setup` configuration that will return the user role for the current request. This function will be called for each request and the user role returned will be used to apply ability filters. If you want to bypass permissions completely for a specific role, you can return `null` from the `getContext` function for that role.

For accessing the context of a Prisma query, we recommend using a package like [cls-hooked](https://www.npmjs.com/package/cls-hooked) to store the context in the current session.

### Example

```ts
import { setup } from "@cerebruminc/yates";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const client = await setup({
    prisma,
    // Define any custom abilities that you want to add to the system.
    customAbilities: {
        Post: {
            insertOwnPost: {
                description: "Insert own post",
                // You can express the rule as a Prisma `where` clause.
                expression: (_client, _row, context) => ({
                  // This expression uses a context setting returned by the getContext function
                  authorId: context('user.id')
                }),
                operation: "INSERT",
            },
        },
        Comment: {
            deleteOnOwnPost: {
                description: "Delete comment on own post",
                // You can express the rule as a Prisma `where` clause.
                expression: (_client, _row, context) => ({
                  post: {
                    authorId: context('user.id')
                  }
                }),
                operation: "DELETE",
            },
        },
        User: {
            updateOwnUser: {
                description: "Update own user",
                expression: (_client, _row, context) => ({
                  id: context('user.id')
                }),
                operation: "UPDATE",
            },
        }
    },
    // Return a mapping of user roles and abilities.
    // This function is parameterised with a list of all CRUD abilities that have been
    // automatically generated by Yates, as well as any customAbilities that have been defined.
    getRoles: (abilities) => {
      return {
        SUPER_ADMIN: "*",
        USER: [
            abilities.User.read,
            abilities.Comment.read
        ],
      };
    },
    getContext: () => {
      // Here we are using cls-hooked to access the context in the current session.
      const ctx = clsSession.get("ctx");
      if (!ctx) {
        return null;
      }
      const { user } = ctx;

      const role = user.role

      return {
        role,
        context: {
            // This context setting will be available in ability expressions via `context(...)`
          'user.id': user.id,
        },
      };
    },
});
```

## Configuration

### Abilities

When defining an ability you need to provide the following properties:

- `description`: A description of the ability.
- `expression`: A Prisma `where` clause (or a function that returns one) that will be combined with the original query. Abilities for the same model + operation are OR-ed together, and the resulting filter is AND-ed with the original query.
  - For `INSERT` operations, the expression is matched against the incoming `data`.
  - For `SELECT`, `UPDATE` and `DELETE` operations, the expression is merged into the Prisma `where` clause.
- `operation`: The operation that the ability is being applied to. This can be one of `INSERT`, `SELECT`, `UPDATE` or `DELETE`.

### Debug

To run Yates in debug mode, use the environment variable `DEBUG=yates`.

## Local development database

### Start/stop Postgres via Docker

This repo includes a local Postgres service in `docker-compose.yml` (mapped to port **5666** on your host):

```bash
docker compose up -d db
```

To stop it:

```bash
docker compose down
```

### Initialize the databases with Prisma

Run the setup script against the Docker database:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5666/yates" \
DATABASE_URL_2="postgresql://postgres:postgres@localhost:5666/yates_2" \
npm run setup
```

## Cookbook

Common permission patterns expressed as Yates abilities.

### Read own records (user-scoped)

Allow a user to read only their own records:

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
getRoles: (abilities) => ({
  USER: [abilities.Post.readOwnPosts],
}),
```

### Create only if the record is owned by the user

Allow creates only when `authorId` matches the current user:

```ts
customAbilities: {
  Post: {
    createOwnPosts: {
      description: "Create own posts",
      operation: "INSERT",
      expression: (_client, _row, context) => ({
        authorId: context("user.id") as string,
      }),
    },
  },
},
```

### Read public OR owned

Combine multiple abilities; they are OR-ed together:

```ts
customAbilities: {
  Post: {
    readPublic: {
      description: "Read public posts",
      operation: "SELECT",
      expression: () => ({ published: true }),
    },
    readOwn: {
      description: "Read own posts",
      operation: "SELECT",
      expression: (_client, _row, context) => ({
        authorId: context("user.id") as string,
      }),
    },
  },
},
getRoles: (abilities) => ({
  USER: [abilities.Post.readPublic, abilities.Post.readOwn],
}),
```

### Update only owned records

```ts
customAbilities: {
  Post: {
    updateOwn: {
      description: "Update own posts",
      operation: "UPDATE",
      expression: (_client, _row, context) => ({
        authorId: context("user.id") as string,
      }),
    },
  },
},
```

### Delete only if record is unpublised and owned

```ts
customAbilities: {
  Post: {
    deleteOwnDrafts: {
      description: "Delete own drafts",
      operation: "DELETE",
      expression: (_client, _row, context) => ({
        AND: [
          { authorId: context("user.id") as string },
          { published: false },
        ],
      }),
    },
  },
},
```

### Tenant isolation by organization id

```ts
customAbilities: {
  Organization: {
    readOrg: {
      description: "Read org",
      operation: "SELECT",
      expression: (_client, _row, context) => ({
        id: context("org.id") as string,
      }),
    },
  },
  Post: {
    readOrgPosts: {
      description: "Read org posts",
      operation: "SELECT",
      expression: (_client, _row, context) => ({
        organizationId: context("org.id") as string,
      }),
    },
  },
},
```

### Membership-based access (relation filter)

Allow access when the user has a role in the org (relation filter):

```ts
customAbilities: {
  Organization: {
    readOrgIfMember: {
      description: "Read org if member",
      operation: "SELECT",
      expression: (_client, _row, context) => ({
        roleAssignment: {
          some: {
            userId: context("user.id") as string,
          },
        },
      }),
    },
  },
},
```

### Admin bypass

Grant all abilities for admins:

```ts
getRoles: (abilities) => ({
  ADMIN: "*",
  USER: [abilities.Post.read, abilities.Post.create],
}),
```

### Soft delete visibility

Hide soft-deleted records by default:

```ts
customAbilities: {
  Post: {
    readNotDeleted: {
      description: "Read non-deleted posts",
      operation: "SELECT",
      expression: () => ({
        deletedAt: null,
      }),
    },
  },
},
```

## Known limitations

### Expression limits

- Create checks support scalar filters and basic `AND`/`OR`/`NOT` logic. Relation filters are supported when the related record can be resolved from the create `data` (for example via `connect` or foreign key fields).

## Migration

- v1 -> v2 guide: `MIGRATION.md`

## License

The project is licensed under the MIT license.

  <br>
  <br>

<div align="center">

![Cerebrum](./images/powered-by-cerebrum-lm.png#gh-light-mode-only)
![Cerebrum](./images/powered-by-cerebrum-dm.svg#gh-dark-mode-only)

</div>
