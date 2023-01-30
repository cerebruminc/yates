import { PrismaClient, User } from "@prisma/client";
import { setup } from "../../src";
import { v4 as uuid } from "uuid";
import { update } from "lodash";

let adminClient: PrismaClient;

beforeAll(async () => {
	adminClient = new PrismaClient();
});

describe("rbac", () => {
	describe("raw", () => {
		it("should skip RBAC when using prisma.$queryRaw()", async () => {
			const prisma = new PrismaClient();

			const user = await prisma.user.create({
				data: {
					email: `test-${uuid()}@test.com`,
				},
			});

			const role = `USER_${uuid()}`;

			await setup({
				prisma,
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.read],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			const users: User[] = await prisma.$queryRaw`SELECT * FROM "User" WHERE "id" = ${user.id}`;

			expect(users).toHaveLength(1);
			expect(users[0].id).toBe(user.id);
		});
	});
	describe("CREATE", () => {
		it("should be able to allow a role to create a resource", async () => {
			const prisma = new PrismaClient();

			const role = `USER_${uuid()}`;

			await setup({
				prisma,
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.read, abilities.Post.create],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			const post = await prisma.post.create({
				data: {
					title: `Test post from ${role}`,
				},
			});

			expect(post.id).toBeDefined();
		});

		it("should be able to disallow a role to create a resource", async () => {
			const prisma = new PrismaClient();

			const role = `USER_${uuid()}`;

			await setup({
				prisma,
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
				prisma.post.create({
					data: {
						title: `Test post from ${role}`,
					},
				}),
			).rejects.toThrowError();
		});
	});

	describe("READ", () => {
		it("should be able to allow a role to read a resource", async () => {
			const prisma = new PrismaClient();

			const role = `USER_${uuid()}`;

			await setup({
				prisma,
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

			const post = await prisma.post.findUnique({
				where: { id: postId },
			});

			expect(post?.id).toBe(postId);
		});

		it("should be able to disallow a role to read a resource", async () => {
			const prisma = new PrismaClient();

			const role = `USER_${uuid()}`;

			await setup({
				prisma,
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

			const post = await prisma.post.findUnique({
				where: { id: postId },
			});

			expect(post).toBeNull();
		});

		it("should be able to allow a role to read a resource using 1:1 relation queries", async () => {
			const prisma = new PrismaClient();

			const role = `USER_${uuid()}`;

			await setup({
				prisma,
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

			const post = await prisma.post.findUnique({
				where: { id: postId },
				include: {
					author: true,
				},
			});

			expect(post?.id).toBe(postId);
			expect(post?.author).toBeDefined();
		});

		it("should be able to allow a role to read a resource using many-to-many relation queries", async () => {
			const prisma = new PrismaClient();

			const role = `USER_${uuid()}`;

			await setup({
				prisma,
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.read, abilities.User.read, abilities.Tag.read],
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

			const post = await prisma.post.findUnique({
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
			const prisma = new PrismaClient();

			const role = `USER_${uuid()}`;

			await setup({
				prisma,
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

			const post = await prisma.post.update({
				where: { id: postId },
				data: {
					title: "lorem ipsum",
				},
			});

			expect(post?.id).toBe(postId);
			expect(post?.title).toBe("lorem ipsum");
		});

		it("should be able to prevent a role from updating a resource it can read", async () => {
			const prisma = new PrismaClient();

			const role = `USER_${uuid()}`;

			await setup({
				prisma,
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

			// Because the role can read the post, the update will silently fail and the post will not be updated.
			// The Postgres docs indicate that an error should be thrown if the policy "WITH CHECK" expression fails, but this is not the case
			// https://www.postgresql.org/docs/11/sql-createpolicy.html#SQL-CREATEPOLICY-UPDATE
			await prisma.post.update({
				where: { id: postId },
				data: {
					title: {
						set: "lorem ipsum",
					},
				},
			});

			const post = await prisma.post.findUnique({
				where: { id: postId },
			});

			expect(post?.title).toBe(title);
		});

		it("should be able to prevent a role from updating a resource it can't read", async () => {
			const prisma = new PrismaClient();

			const role = `USER_${uuid()}`;

			await setup({
				prisma,
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
				prisma.post.update({
					where: { id: postId },
					data: {
						title: "lorem ipsum",
					},
				}),
			).rejects.toThrow();
		});

		it("should be able to prevent a role from updating a resource it can't update due to an explicit custom ability", async () => {
			const prisma = new PrismaClient();

			const role = `USER_${uuid()}`;
			const updateAbility = `updateWithC_${uuid()}`;
			const readAbility = `readWithC_${uuid()}`;
			const title = `Test post from ${role} - ${uuid()}`;

			await setup({
				prisma,
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
						[role]: [abilities.Post[readAbility], abilities.Post[updateAbility]],
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
				prisma.post.update({
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
			const prisma = new PrismaClient();

			const role = `USER_${uuid()}`;

			await setup({
				prisma,
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

			await prisma.post.delete({
				where: { id: postId },
			});

			const post = await adminClient.post.findUnique({
				where: { id: postId },
			});

			expect(post).toBeNull();
		});

		it("should be able to prevent a role from deleting a resource", async () => {
			const prisma = new PrismaClient();

			const role = `USER_${uuid()}`;

			await setup({
				prisma,
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

			await prisma.post.delete({
				where: { id: postId },
			});

			const post = await adminClient.post.findUnique({
				where: { id: postId },
			});

			expect(post).not.toBeNull();
		});
	});
});
