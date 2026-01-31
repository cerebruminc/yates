import { PrismaClient } from "@prisma/client";
import { PrismaClient as PrismaClient2 } from "../../prisma/secondary/generated/client";
import { setup } from "../../src";

describe("Multi-tenant database tests", () => {
	it("should not overwrite data between tenants", async () => {
		const rootClient1 = new PrismaClient();
		const rootClient2 = new PrismaClient2();

		const role = "ADMIN";

		const client1 = await setup({
			prisma: rootClient1,
			getRoles(_abilities) {
				return {
					[role]: "*",
				};
			},
			getContext: () => ({
				role,
			}),
		});
		const post1 = await client1.post.create({
			data: {
				title: `post-${role}`,
			},
		});
		expect(post1.id).toBeDefined();

		const client2 = await setup({
			prisma: rootClient2 as PrismaClient,
			getRoles(abilities) {
				return {
					[role]: [abilities.User.read],
				};
			},
			getContext: () => ({
				role,
			}),
		});
		await expect(
			client2.user.create({
				data: {
					email: `test-${role}@example.com`,
				},
			}),
		).rejects.toThrow();

		// The setup of client2 should not have affected client1
		const post2 = await client1.post.create({
			data: {
				title: `post-${role}-2`,
			},
		});
		expect(post2.id).toBeDefined();
	});
});
