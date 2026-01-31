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
						expression: {},
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
							expression: {},
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
							expression: {},
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
						expression: (_client, _row, context) => ({
							title: context(BAD_STRING as any) as string,
						}),
					},
				},
			},
			getRoles(abilities) {
				return {
					[role]: [abilities.Post.createWithTitle as any, abilities.Post.read],
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
						expression: (_client, _row, context) => ({
							title: context("post.title") as string,
						}),
					},
				},
			},
			getRoles(abilities) {
				return {
					[role]: [abilities.Post.createWithTitle as any, abilities.Post.read],
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

		// The value should simply not match and fail the permission check, rather than throwing an error
		await expect(
			client.post.create({
				data: {
					title: postTitle,
				},
			}),
		).rejects.toThrow("You do not have permission to perform this action");
	});

	it("should reject create checks when relation filters cannot be resolved from data", async () => {
		const initial = new PrismaClient();

		const role = `USER_${uuid()}`;

		const client = await setup({
			prisma: initial,
			customAbilities: {
				Post: {
					createWithTitle: {
						description: "Test Post Create",
						operation: "INSERT",
						expression: () => ({
							tags: {
								some: {
									label: "test",
								},
							},
						}),
					},
				},
			},
			getRoles(abilities) {
				return {
					[role]: [abilities.Post.createWithTitle as any, abilities.Post.read],
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
		await expect(
			client.post.create({
				data: {
					title: "test",
				},
			}),
		).rejects.toThrow(
			"You do not have permission to perform this action: Post.create(...)",
		);
	});
});
