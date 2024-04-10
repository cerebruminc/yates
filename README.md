<div align="center">
  <img width="200" height="200" src="https://raw.githubusercontent.com/cerebruminc/yates/master/images/yates-icon.png">

[![npm version](https://img.shields.io/npm/v/@cerebruminc/yates)](https://www.npmjs.com/package/@cerebruminc/yates)

  <h1>Yates = Prisma + RLS</h1>

  <p>
    A module for implementing role based access control with Prisma when using Postgres
  </p>
  <br>
</div>

> English: from Middle English _yates_ ‘gates’ plural of _yate_ Old English _geat_ ‘gate’ hence a topographic or occupational name for someone who lived by the gates of a town or castle and who probably acted as the gatekeeper or porter.

<br>

Yates is a module for implementing role based access control with Prisma. It is designed to be used with the [Prisma Client](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client) and [PostgreSQL](https://www.postgresql.org/).
It uses the [Row Level Security](https://www.postgresql.org/docs/9.5/ddl-rowsecurity.html) feature of PostgreSQL to provide a simple and secure way to implement role based access control that allows you to define complex access control rules and have them apply to all of your Prisma queries automatically.

## Prerequisites

Yates requires the `prisma` package ate version 4.9.0 or greater and the `@prisma/client` package at version 4.0.0 or greater. Additionally it makes use of the [Prisma Client extensions](https://www.prisma.io/docs/concepts/components/prisma-client/client-extensions) preview feature to generate rules and add RLS checking, so you will need to enable this feature in your Prisma schema.

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["clientExtensions"]
}
```

## Installation

```bash
npm i @cerebruminc/yates
```

## Usage

Once you've installed Yates, you can use it in your Prisma project by importing it and calling the `setup` function. This function takes a Prisma Client instance and a configuration object as arguments and returns a client that can intercept all queries and apply the appropriate row level security policies to them.
Yates uses client extensions to generate the RLS rules and add the RLS checking to the Prisma Client queries. This means that you can use the Prisma Client as you normally would, and Yates will automatically apply the appropriate RLS policies to each query. It also means that you will need to apply your middleware _before_ creating the Yates client, as middleware cannot be applied to an extended client.
Client extensions share the same API as the Prisma Client, you can use the Yates client as a drop-in replacement for the Prisma Client in your application.
Client extensions also share the same connection pool as the base client, which means that you can freely create new Yates clients with minimal performance impact.

The `setup` function will generate CRUD abilities for each model in your Prisma schema, as well as any additional abilities that you have defined in your configuration. It will then create a new PG role for each ability and apply the appropriate row level security policies to each role. Finally, it will create a new PG role for each user role you specify and grant them the appropriate abilities.
For Yates to be able to set the correct user role for each request, you must pass a function called `getContext` in the `setup` configuration that will return the user role for the current request. This function will be called for each request and the user role returned will be used to set the `role` in the current session. If you want to bypass RLS completely for a specific role, you can return `null` from the `getContext` function for that role.
For accessing the context of a Prisma query, we recommend using a package like [cls-hooked](https://www.npmjs.com/package/cls-hooked) to store the context in the current session.

```ts
import { setup } from "@cerebruminc/yates";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const client = await setup({
    prisma,
    // Define any custom abilities that you want to add to the system.
    customAbilities: () => ({
        USER: {
            Post: {
                insertOwnPost: {
                    description: "Insert own post",
                    // You can express the rule as a Prisma `where` clause.
                    expression: (client, row, context) => {
                      return {
                        // This expression uses a context setting returned by the getContext function
                        authorId: context('user.id')
                      }
                    },
                    operation: "INSERT",
                },
            },
            Comment: {
                deleteOnOwnPost: {
                    description: "Delete comment on own post",
                    // You can also express the rule as a conventional Prisma query.
                    expression: (client, row, context) => {
                      return client.post.findFirst({
                        where: {
                          id: row('postId'),
                          authorId: context('user.id')
                        }
                      })
                    },
                    operation: "DELETE",
                },
            },
            User: {
                updateOwnUser: {
                    description: "Update own user",
                    // For low-level control you can also write expressions as a raw SQL string.
                    expression: `current_setting('user.id') = "id"`,
                    operation: "UPDATE",
                },
            }
        }
    }),
    // Return a mapping of user roles and abilities.
    // This function is paramaterised with a list of all CRUD abilities that have been
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
            // This context setting will be available in ability expressions using `current_setting('user.id')`
          'user.id': user.id,
        },
      };
    },
    options: {
      // The maximum amount of time Yates will wait to acquire a transaction from the database. The default value is 30 seconds.
      txMaxWait: 5000,
      // The maximum amount of time the Yates query transaction can run before being canceled and rolled back. The default value is 30 seconds.
      txTimeout: 10000,
    }
});
```

## Configuration

### Abilities

When defining an ability you need to provide the following properties:

- `description`: A description of the ability.
- `expression`: A boolean SQL expression that will be used to filter the results of the query. This expression can use any of the columns in the table that the ability is being applied to, as well as any context settings that have been defined in the `getContext` function.

  - For `INSERT`, `UPDATE` and `DELETE` operations, the expression uses the values from the row being inserted. If the expression returns `false` for a row, that row will not be inserted, updated or deleted.
  - For `SELECT` operations, the expression uses the values from the row being returned. If the expression returns `false` for a row, that row will not be returned.

- `operation`: The operation that the ability is being applied to. This can be one of `CREATE`, `READ`, `UPDATE` or `DELETE`.

### Debug

To run Yates in debug mode, use the environment variable `DEBUG=yates`.

## Known limitations

### Nested transactions

Yates uses a transaction to apply the RLS policies to each query. This means that if you are using transactions in your application, rollbacks will not work as expected. This is because [Prisma has poor support for nested transactions](https://github.com/prisma/prisma/issues/15212) and will `COMMIT` the inner transaction even if the outer transaction is rolled back.
If you need this functionality and you are using Yates, you can return `null` from the `getContext()` setup method to bypass the internal transaction, and therefore the RLS policies for the current request. see the `nested-transactions.spec.ts` test case for an example of how to do this.

### Unsupported Prisma Client query features

If you are using the Prisma client to construct an ability expression, the following `where` keywords are not supported.

- `AND`
- `OR`
- `NOT`
- `is`
- `isNot`

Additionally, using context or row values to query Prisma Enums is not supported.

If you need to use these expressions, you can use the `expression` property of the ability to write a raw SQL expression instead.

## License

The project is licensed under the MIT license.

  <br>
  <br>

<div align="center">

![Cerebrum](./images/powered-by-cerebrum-lm.png#gh-light-mode-only)
![Cerebrum](./images/powered-by-cerebrum-dm.svg#gh-dark-mode-only)

</div>
