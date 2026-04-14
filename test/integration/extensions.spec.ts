import { PrismaClient } from "@prisma/client";
import { createNamespace } from "cls-hooked";
import { v4 as uuid } from "uuid";
import { setup } from "../../src";
import { createPrismaClient } from "../helpers/prisma-client";

describe("extensions", () => {
	it("should not cause query extensions to run multiple times for the same query", async () => {
		const extensionSpy = jest.fn();

		const prisma = createPrismaClient().$extends({
			query: {
				$allModels: {
					async $allOperations({ model, operation, args, query }) {
						extensionSpy({ model, operation });
						return query(args);
					},
				},
			},
		});

		const role = `USER_${uuid()}`;

		const client = await setup({
			prisma: prisma as unknown as PrismaClient,
			getRoles(abilities) {
				return {
					[role]: [abilities.Post.read, abilities.Post.create],
				};
			},
			getContext: () => ({
				role,
			}),
		});

		extensionSpy.mockClear();

		const post = await client.post.create({
			data: {
				title: `Test post from ${role}`,
			},
		});

		expect(post.id).toBeDefined();
		expect(extensionSpy).toHaveBeenCalledTimes(1);
		expect(extensionSpy.mock.calls[0][0].model).toBe("Post");
		expect(extensionSpy.mock.calls[0][0].operation).toBe("create");
	});

	it("should not be able to bypass RBAC when cls-hooked is used in query extensions", async () => {
		const clsSession = createNamespace("test");

		const prisma = createPrismaClient().$extends({
			query: {
				$allModels: {
					async $allOperations({ args, query }) {
						await Promise.resolve();
						return query(args);
					},
				},
			},
		});

		const roleName = `USER_${uuid()}`;

		const client = await setup({
			prisma: prisma as unknown as PrismaClient,
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
});
