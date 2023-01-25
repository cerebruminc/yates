import { PrismaClient, User } from "@prisma/client";
import { setup } from "../../src";
import { v4 as uuid } from "uuid";

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
});
