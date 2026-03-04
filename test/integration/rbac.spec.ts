import { PrismaClient, User } from "@prisma/client";
import { v4 as uuid } from "uuid";
import { setup } from "../../src";

let adminClient: PrismaClient;

beforeAll(async () => {
	adminClient = new PrismaClient();
});

describe("rbac", () => {
	describe("raw", () => {
		it("should skip RBAC when using prisma.$queryRaw()", async () => {
			const initial = new PrismaClient();

			const user = await initial.user.create({
				data: {
					email: `test-${uuid()}@test.com`,
				},
			});

			const role = `USER_${uuid()}`;

			const client = await setup({
				prisma: initial,
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.read],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			const users: User[] =
				await client.$queryRaw`SELECT * FROM "User" WHERE "id" = ${user.id}`;

			expect(users).toHaveLength(1);
			expect(users[0].id).toBe(user.id);
		});
	});
	describe("CREATE", () => {
		it("should be able to allow a role to create a resource", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const client = await setup({
				prisma: initial,
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.read, abilities.Post.create],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			const post = await client.post.create({
				data: {
					title: `Test post from ${role}`,
				},
			});

			expect(post.id).toBeDefined();
		});

		it("should be able to disallow a role to create a resource", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const client = await setup({
				prisma: initial,
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.read],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			await expect(
				client.post.create({
					data: {
						title: `Test post from ${role}`,
					},
				}),
			).rejects.toThrowError();
		});
	});

	describe("READ", () => {
		it("should be able to allow a role to read a resource", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const client = await setup({
				prisma: initial,
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.read],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			const { id: postId } = await adminClient.post.create({
				data: {
					title: `Test post from ${role}`,
				},
			});

			const post = await client.post.findUnique({
				where: { id: postId },
			});

			expect(post?.id).toBe(postId);
		});

		it("should be able to disallow a role to read a resource", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const client = await setup({
				prisma: initial,
				getRoles(abilities) {
					return {
						[role]: [abilities.User.read],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			const { id: postId } = await adminClient.post.create({
				data: {
					title: `Test post from ${role}`,
				},
			});

			const post = await client.post.findUnique({
				where: { id: postId },
			});

			expect(post).toBeNull();
		});

		it("should be able to allow a role to read a resource using 1:1 relation queries", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const client = await setup({
				prisma: initial,
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.read, abilities.User.read],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			const { id: postId } = await adminClient.post.create({
				data: {
					title: `Test post from ${role}`,
					author: {
						create: {
							email: `test-${uuid()}@test.com`,
						},
					},
				},
			});

			const post = await client.post.findUnique({
				where: { id: postId },
				include: {
					author: true,
				},
			});

			expect(post?.id).toBe(postId);
			expect(post?.author).toBeDefined();
		});

		it("should be able to allow a role to read a resource using many-to-many relation queries", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const client = await setup({
				prisma: initial,
				getRoles(abilities) {
					return {
						[role]: [
							abilities.Post.read,
							abilities.User.read,
							abilities.Tag.read,
						],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			const { id: postId } = await adminClient.post.create({
				data: {
					title: `Test post from ${role}`,
					tags: {
						create: {
							label: "engineering",
						},
					},
				},
			});

			const post = await client.post.findUnique({
				where: { id: postId },
				select: {
					id: true,
					title: true,
					tags: {
						select: {
							label: true,
						},
					},
				},
			});

			expect(post?.id).toBe(postId);
			expect(post?.tags).toBeDefined();
		});
	});

	describe("UPDATE", () => {
		it("should be able to allow a role to update a resource", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const client = await setup({
				prisma: initial,
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.read, abilities.Post.update],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			const { id: postId } = await adminClient.post.create({
				data: {
					title: `Test post from ${role}`,
				},
			});

			const post = await client.post.update({
				where: { id: postId },
				data: {
					title: "lorem ipsum",
				},
			});

			expect(post?.id).toBe(postId);
			expect(post?.title).toBe("lorem ipsum");
		});

		it("should be able to prevent a role from updating a resource it can read", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const client = await setup({
				prisma: initial,
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.read],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			const { id: postId, title } = await adminClient.post.create({
				data: {
					title: `Test post from ${role}`,
				},
			});

			await expect(() =>
				client.post.update({
					where: { id: postId },
					data: {
						title: {
							set: "lorem ipsum",
						},
					},
				}),
			).rejects.toThrow("Record to update not found");

			const post = await client.post.findUnique({
				where: { id: postId },
			});

			expect(post?.title).toBe(title);
		});

		it("should be able to prevent a role from updating a resource it can't read", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const client = await setup({
				prisma: initial,
				getRoles(abilities) {
					return {
						[role]: [abilities.User.read],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			const { id: postId } = await adminClient.post.create({
				data: {
					title: `Test post from ${role}`,
				},
			});

			await expect(
				client.post.update({
					where: { id: postId },
					data: {
						title: "lorem ipsum",
					},
				}),
			).rejects.toThrow();
		});
		it("should be able to prevent a role from updating a resource it can't update due to an explicit custom ability", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;
			const updateAbility = `updateWithC_${uuid()}`;
			const readAbility = `readWithC_${uuid()}`;
			const title = `Test post from ${role} - ${uuid()}`;

			const client = await setup({
				prisma: initial,
				customAbilities: {
					Post: {
						[updateAbility]: {
							description: "Update with specific title",
							expression: `title = '${title}'`,
							operation: "UPDATE",
						},
						[readAbility]: {
							description: "Read with specific title",
							expression: `title = '${title}'`,
							operation: "SELECT",
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [
							abilities.Post[readAbility],
							abilities.Post[updateAbility],
						],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			const { id: postId } = await adminClient.post.create({
				data: {
					title: `Test post from ${role}`,
				},
			});

			await expect(
				client.post.update({
					where: { id: postId },
					data: {
						title: "lorem ipsum",
					},
				}),
			).rejects.toThrow();
		});
	});

	describe("DELETE", () => {
		it("should be able to allow a role to delete a resource", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const client = await setup({
				prisma: initial,
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.read, abilities.Post.delete],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			const { id: postId } = await adminClient.post.create({
				data: {
					title: `Test post from ${role}`,
				},
			});

			await client.post.delete({
				where: { id: postId },
			});

			const post = await adminClient.post.findUnique({
				where: { id: postId },
			});

			expect(post).toBeNull();
		});

		it("should be able to prevent a role from deleting a resource", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const client = await setup({
				prisma: initial,
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.read],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			const { id: postId } = await adminClient.post.create({
				data: {
					title: `Test post from ${role}`,
				},
			});

			await expect(
				client.post.delete({
					where: { id: postId },
				}),
			).rejects.toThrow();

			const post = await adminClient.post.findUnique({
				where: { id: postId },
			});

			expect(post).not.toBeNull();
		});
	});
});
