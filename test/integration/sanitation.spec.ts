import { PrismaClient } from "@prisma/client";
import { v4 as uuid } from "uuid";
import { setup } from "../../src";

let adminClient: PrismaClient;

beforeAll(async () => {
	adminClient = new PrismaClient();
});

// https://xkcd.com/327/
const BAD_STRING = "Robert'); DROP TABLE STUDENTS; --";

describe("sanitation", () => {
	it("should sanitize role names", async () => {
		const inital = new PrismaClient();
		const role = BAD_STRING;

		const client = await setup({
			prisma: inital,
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

	it("should sanitize ability names", async () => {
		const initial = new PrismaClient();
		const role = `USER_${uuid()}`;
		const ability = BAD_STRING;
		const client = await setup({
			prisma: initial,
			customAbilities: {
				Post: {
					[ability]: {
						description: "Test Post Read",
						operation: "SELECT",
						expression: "true",
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
				title: `Test post from ${role}`,
			},
		});

		const post = await client.post.findUnique({
			where: { id: postId },
		});

		expect(post?.id).toBe(postId);
	});

	it("should sanitize operations", async () => {
		const initial = new PrismaClient();
		const role = `USER_${uuid()}`;
		const ability = "customAbility";

		await expect(
			setup({
				prisma: initial,
				customAbilities: {
					Post: {
						[ability]: {
							description: "Test Post Read",
							// This is intentional for testing
							operation: BAD_STRING as any,
							expression: "true",
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
			}),
		).rejects.toThrowError("Invalid operation");
	});

	it("should sanitize model names", async () => {
		const initial = new PrismaClient();
		const role = `USER_${uuid()}`;
		const ability = "customAbility";

		await expect(
			setup({
				prisma: initial,
				customAbilities: {
					[BAD_STRING]: {
						[ability]: {
							description: "Test Post Read",
							operation: "SELECT",
							expression: "true",
						},
					},
					// This is intentional for testing
				} as any,
				getRoles(abilities) {
					return {
						// This is intentional for testing
						[role]: [(abilities as any)[BAD_STRING][ability]],
					};
				},
				getContext: () => ({
					role,
				}),
			}),
		).rejects.toThrowError("Invalid models in custom abilities");
	});

	it("should sanitize custom context keys", async () => {
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
				},
			},
			getRoles(abilities) {
				return {
					[role]: [abilities.Post.createWithTitle, abilities.Post.read],
				};
			},
			getContext: () => {
				return {
					role,
					context: {
						[BAD_STRING]: postTitle,
					},
				};
			},
		});

		await expect(
			client.post.create({
				data: {
					title: BAD_STRING,
				},
			}),
		).rejects.toThrow(
			`Context variable "${BAD_STRING}" contains invalid characters`,
		);
	});

	it("should sanitize custom context values", async () => {
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
				},
			},
			getRoles(abilities) {
				return {
					[role]: [abilities.Post.createWithTitle, abilities.Post.read],
				};
			},
			getContext: () => {
				return {
					role,
					context: {
						"post.title": BAD_STRING,
					},
				};
			},
		});

		// We use a prepared statement to sanitize the value, so the expectation
		// is that it would simply not match and fail the RLS check, rather than throwing an error
		await expect(
			client.post.create({
				data: {
					title: postTitle,
				},
			}),
		).rejects.toThrow("You do not have permission to perform this action");
	});

	// Note: SQL check expressions are inherently unsafe, so we don't sanitize them
	// Postgres will throw an error if the expression is invalid, which gives us some safety, however
	// the ideal solution is to use a query builder for the expression
	it("should sanitize custom ability expressions", async () => {
		const initial = new PrismaClient();

		const role = `USER_${uuid()}`;

		const setupPromise = setup({
			prisma: initial,
			customAbilities: {
				Post: {
					createWithTitle: {
						description: "Test Post Create",
						operation: "INSERT",
						expression: 'DROP TABLE "Post"',
					},
				},
			},
			getRoles(abilities) {
				return {
					[role]: [abilities.Post.createWithTitle, abilities.Post.read],
				};
			},
			getContext: () => {
				return {
					role,
					context: {
						"post.title": BAD_STRING,
					},
				};
			},
		});
		await expect(setupPromise).rejects.toThrow("syntax error");
	});
});
