import { PrismaClient } from "@prisma/client";
import { v4 as uuid } from "uuid";
import { setup } from "../../src";

let adminClient: PrismaClient;

beforeAll(async () => {
	adminClient = new PrismaClient();
});

describe("setup", () => {
	describe("params.getRoles()", () => {
		it("should provide a set of built-in abilities for CRUD operations", async () => {
			const prisma = new PrismaClient();
			const models = [
				"User",
				"Organization",
				"RoleAssignment",
				"Role",
				"Post",
				"Item",
				"Tag",
				"Hat",
				"Account",
			];
			expect.assertions(models.length + 2);

			const getRoles = jest.fn((_abilities) => {
				return {
					USER: "*",
					// This is intentional for testing
				} as any;
			});

			await setup({
				prisma,
				getRoles,
				getContext: () => null,
			});

			expect(getRoles.mock.calls).toHaveLength(1);
			const abilities = getRoles.mock.calls[0][0];

			expect(Object.keys(abilities)).toStrictEqual([
				"User",
				"Organization",
				"RoleAssignment",
				"Role",
				"Post",
				"Item",
				"Tag",
				"Hat",
				"Account",
			]);

			for (const model of models) {
				expect(Object.keys(abilities[model])).toStrictEqual([
					"create",
					"read",
					"update",
					"delete",
				]);
			}
		});
	});

	describe("params.getContext()", () => {
		it("should skip RBAC if .getContext() returns null", async () => {
			const prisma = new PrismaClient();

			const role = `USER_${uuid()}`;

			const client = await setup({
				prisma,
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.read],
					};
				},
				getContext: () => {
					return null;
				},
			});

			const post = await client.post.create({
				data: {
					title: "Test post",
				},
			});

			expect(post.id).toBeDefined();
		});

		it("should allow a custom context to be set", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const postTitle = `Test post from ${role}`;

			const client = await setup({
				prisma: initial,
				customAbilities: {
					Post: {
						createWithTitle: {
							description: "Test Post Create",
							operation: "INSERT",
							expression: "current_setting('post.title') = title",
						},
						readWithTitle: {
							description: "Test Post Read",
							operation: "SELECT",
							expression: "current_setting('post.title') = title",
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [
							abilities.Post.createWithTitle,
							abilities.Post.readWithTitle,
						],
					};
				},
				getContext: () => {
					return {
						role,
						context: {
							"post.title": postTitle,
						},
					};
				},
			});

			const post = await client.post.create({
				data: {
					title: postTitle,
				},
			});

			expect(post.id).toBeDefined();
		});
	});

	describe("params.customAbilities", () => {
		it("should be able to allow a role to create a resource using a custom ability", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const client = await setup({
				prisma: initial,
				customAbilities: {
					Post: {
						customCreateAbility: {
							description: "Create posts with the title 'test'",
							operation: "INSERT",
							expression: "title = 'test'",
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.customCreateAbility, abilities.Post.read],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			const post = await client.post.create({
				data: {
					title: "test",
				},
			});

			expect(post.id).toBeDefined();

			await expect(
				client.post.create({
					data: {
						title: "invalid title",
					},
				}),
			).rejects.toThrow();
		});

		it("should be able to allow a role to read a resource using a custom ability", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;
			const ability = `customReadAbility_${role}`;

			const client = await setup({
				prisma: initial,
				customAbilities: {
					Post: {
						[ability]: {
							description: "Read posts with the title 'test'",
							operation: "SELECT",
							expression: "title = 'test'",
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [abilities.Post[ability]],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			const { id: postId } = await adminClient.post.create({
				data: {
					title: "test",
				},
			});

			const post = await client.post.findUnique({
				where: {
					id: postId,
				},
			});

			expect(post).toBeDefined();
		});

		it("should be able to allow a role to update a resource using a custom ability", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const client = await setup({
				prisma: initial,
				customAbilities: {
					Post: {
						customUpdateAbility: {
							description: "Update posts with the title 'test'",
							operation: "UPDATE",
							expression: "title = 'test'",
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.customUpdateAbility, abilities.Post.read],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			const { id: postId } = await adminClient.post.create({
				data: {
					title: "test",
				},
			});

			const post = await client.post.update({
				where: {
					id: postId,
				},
				data: {
					published: true,
				},
			});

			expect(post.published).toBe(true);

			const { id: postId2 } = await adminClient.post.create({
				data: {
					title: "wrong title",
				},
			});

			await expect(() =>
				client.post.update({
					where: {
						id: postId2,
					},
					data: {
						published: true,
					},
				}),
			).rejects.toThrow("Record to update not found");
		});

		it("should be able to allow a role to delete a resource using a custom ability", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const client = await setup({
				prisma: initial,
				customAbilities: {
					Post: {
						customDeleteAbility: {
							description: "Delete posts with the title 'test'",
							operation: "DELETE",
							expression: "title = 'test'",
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.customDeleteAbility, abilities.Post.read],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			const { id: postId } = await adminClient.post.create({
				data: {
					title: "test",
				},
			});

			await client.post.delete({
				where: {
					id: postId,
				},
			});

			const exists = await adminClient.post.findUnique({
				where: {
					id: postId,
				},
			});

			expect(exists).toBeNull();

			const { id: postId2 } = await adminClient.post.create({
				data: {
					title: "wrong title",
				},
			});

			await expect(
				client.post.delete({
					where: {
						id: postId2,
					},
				}),
			).rejects.toThrow("Record to delete does not exist");

			const exists2 = await adminClient.post.findUnique({
				where: {
					id: postId2,
				},
			});

			expect(exists2).not.toBeNull();
		});
	});
});
