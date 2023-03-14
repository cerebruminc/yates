import { PrismaClient, Prisma } from "@prisma/client";
import { createNamespace } from "cls-hooked";
import { v4 as uuid } from "uuid";
import { setup } from "../../src";

describe("middlewares", () => {
	it("should not cause middleware to run multiple times for the same query", async () => {
		const prisma = new PrismaClient();

		const middlewareSpy = jest.fn(async (params, next) => {
			return next(params);
		});

		prisma.$use(middlewareSpy);

		const role = `USER_${uuid()}`;

		const client = await setup({
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

		const post = await client.post.create({
			data: {
				title: `Test post from ${role}`,
			},
		});

		expect(post.id).toBeDefined();
		expect(middlewareSpy).toHaveBeenCalledTimes(3);
		expect(middlewareSpy.mock.calls[0][0].model).toBe("Post");
		expect(middlewareSpy.mock.calls[1][0].model).toBeUndefined();
		expect(middlewareSpy.mock.calls[1][0].action).toBe("queryRaw");
		expect(middlewareSpy.mock.calls[2][0].model).toBeUndefined();
		expect(middlewareSpy.mock.calls[2][0].action).toBe("queryRaw");
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

		const client = await setup({
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
						const result = await client.post.create({
							data: {
								title: `Test post from ${roleName}`,
							},
						});
						res(result);
					} catch (e) {
						reject(e);
					}
				});
			}),
		).rejects.toThrow();
	});

	it("should not be able to bypass RBAC when async middleware is used", async () => {
		const prisma = new PrismaClient();

		const middleware: Prisma.Middleware = async (params, next) => {
			await "test";
			return next(params);
		};

		prisma.$use(middleware);

		const roleName = `USER_${uuid()}`;

		const client = await setup({
			prisma,
			getRoles(abilities) {
				return {
					[roleName]: [abilities.Post.read],
				};
			},
			getContext: () => {
				return {
					role: roleName,
				};
			},
		});

		await expect(
			client.post.create({
				data: {
					title: `Test post from ${roleName}`,
				},
			}),
		).rejects.toThrow();
	});
});
