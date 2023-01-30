import { PrismaClient, User } from "@prisma/client";
import { setup } from "../../src";
import { v4 as uuid } from "uuid";

let adminClient: PrismaClient;

beforeAll(async () => {
	adminClient = new PrismaClient();
});

describe("migrations", () => {
	it("should be able to add an ability to an existing role", async () => {
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

		// Check that the role cannot create a post
		await expect(
			client.post.create({
				data: {
					title: `Test post from ${role}`,
				},
			}),
		).rejects.toThrow();

		// Setup again, this time with the `create` ability
		await setup({
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

		// Check that you can now create a post
		const post = await client.post.create({
			data: {
				title: `Test post from ${role}`,
			},
		});

		expect(post.id).toBeDefined();
	});

	it("should be able to remove an ability to an existing role", async () => {
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

		// Check that you can now create a post
		const post = await client.post.create({
			data: {
				title: `Test post from ${role}`,
			},
		});

		expect(post.id).toBeDefined();

		// Setup again, this time without the `create` ability
		await setup({
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

		// Check that the role cannot create a post
		await expect(
			client.post.create({
				data: {
					title: `Test post from ${role}`,
				},
			}),
		).rejects.toThrow();
	});

	it("should be able to update a custom ability", async () => {
		const initial = new PrismaClient();

		const role = `USER_${uuid()}`;

		const client = await setup({
			prisma: initial,
			customAbilities: {
				Post: {
					readWithTitle: {
						description: "Read posts with a special title",
						operation: "SELECT",
						expression: "title = 'Special title'",
					},
				},
			},
			getRoles(abilities) {
				return {
					[role]: [abilities.Post.readWithTitle],
				};
			},
			getContext: () => ({
				role,
			}),
		});

		const titleString = "Normal title";
		// Check that you can't read this post
		const post = await adminClient.post.create({
			data: {
				title: "Normal title",
			},
		});

		const result1 = await client.post.findUnique({
			where: {
				id: post.id,
			},
		});

		expect(result1).toBeNull();

		// Setup again, this time with an updated custom ability
		await setup({
			prisma: initial,
			customAbilities: {
				Post: {
					readWithTitle: {
						description: "Read posts with a special title",
						operation: "SELECT",
						expression: `title = '${titleString}'`,
					},
				},
			},
			getRoles(abilities) {
				return {
					[role]: [abilities.Post.readWithTitle],
				};
			},
			getContext: () => ({
				role,
			}),
		});

		// Check that the role can now read the post
		const result2 = await client.post.findUnique({
			where: {
				id: post.id,
			},
		});

		expect(result2?.id).toBe(post.id);
	});
});
