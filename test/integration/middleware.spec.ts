import { PrismaClient, Prisma } from "@prisma/client";
import { createNamespace } from "cls-hooked";
import { v4 as uuid } from "uuid";
import { setup } from "../../src";

let adminClient: PrismaClient;

beforeAll(async () => {
  adminClient = new PrismaClient();
});

describe("middlewares", () => {
  it("should not run twice", async () => {
    const prisma = new PrismaClient();

    const middlewareSpy = jest.fn(async (params, next) => {
      return next(params);
    });

    prisma.$use(middlewareSpy);

    const role = `USER_${uuid()}`;

    await setup({
      prisma,
      getRoles(abilities) {
        return {
          [role]: [abilities.Post.read, abilities.Post.create],
        };
      },
      getContext: () => {
        return {
          role,
        };
      },
    });

    middlewareSpy.mockClear();

    const post = await prisma.post.create({
      data: {
        title: `Test post from ${role}`,
      },
    });

    expect(post.id).toBeDefined();
    expect(middlewareSpy).toHaveBeenCalledTimes(1);
  });

  it("should not be able to bypass RBAC when using cls-hooked", async () => {
    const prisma = new PrismaClient();

    const middleware: Prisma.Middleware = async (params, next) => {
      if (params.model === "Post") {
        const post = await next(params);
        return post;
      } else {
        return next(params);
      }
    };

    const clsSession = createNamespace("test");

    prisma.$use(middleware);

    const roleName = `USER_${uuid()}`;

    await setup({
      prisma,
      getRoles(abilities) {
        return {
          [roleName]: [abilities.Post.read],
        };
      },
      getContext: () => {
        const role = clsSession.get("role");
        return {
          role,
        };
      },
    });

    await expect(
      new Promise((res, reject) => {
        clsSession.run(async () => {
          try {
            clsSession.set("role", roleName);
            const result = await prisma.post.create({
              data: {
                title: `Test post from ${roleName}`,
              },
            });
            res(result);
          } catch (e) {
            reject(e);
          }
        });
      })
    ).rejects.toThrow();
  });
});
