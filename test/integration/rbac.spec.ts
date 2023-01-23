import { PrismaClient } from "@prisma/client";
import { setup } from "../../src";
import { v4 as uuid } from "uuid";

let adminClient: PrismaClient;

beforeAll(async () => {
	adminClient = new PrismaClient();
});

describe("rbac", () => {
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
				getContext: () => {
					return {
						role,
						context: {},
					};
				},
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
				getContext: () => {
					return {
						role,
						context: {},
					};
				},
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
				getContext: () => {
					return {
						role,
						context: {},
					};
				},
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
				getContext: () => {
					return {
						role,
						context: {},
					};
				},
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
	});
});
