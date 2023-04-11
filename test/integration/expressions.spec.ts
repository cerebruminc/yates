import { PrismaClient } from "@prisma/client";
import _ from "lodash";
import { v4 as uuid } from "uuid";
import { setup } from "../../src";

jest.setTimeout(30000);

let adminClient: PrismaClient;

beforeAll(async () => {
	adminClient = new PrismaClient();
});

describe("expressions", () => {
	describe("using a Prisma 'where' clause as an expression", () => {
		it("should be able to allow access using static values", async () => {
			const initial = new PrismaClient();
			const role = `USER_${uuid()}`;

			const user = await adminClient.user.create({
				data: {
					email: `test-user-${uuid()}@example.com`,
				},
			});
			const dummyUser = await adminClient.user.create({
				data: {
					email: `test-user-${uuid()}@example.com`,
				},
			});

			const client = await setup({
				prisma: initial,
				customAbilities: {
					User: {
						readOwnUser: {
							description: "Read own user",
							operation: "SELECT",
							expression: (_client: PrismaClient, _row, _context) => {
								return {
									id: user.id,
								};
							},
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [abilities.User.readOwnUser],
					};
				},
				getContext: () => ({
					role,
					context: {},
				}),
			});

			const notFound = await client.user.findUnique({
				where: {
					id: dummyUser.id,
				},
			});

			expect(notFound).toBeNull();

			const ownUser = await client.user.findUnique({
				where: {
					id: user.id,
				},
			});

			expect(ownUser).toBeDefined();
		});

		it("should be able to allow access using row values", async () => {
			const initial = new PrismaClient();
			const role = `USER_${uuid()}`;

			const email = `test-user-${uuid()}@example.com`;

			const user = await adminClient.user.create({
				data: {
					email,
					name: email,
				},
			});

			const dummyUser = await adminClient.user.create({
				data: {
					email: `test-user-${uuid()}@example.com`,
					name: "John Matrix",
				},
			});

			const client = await setup({
				prisma: initial,
				customAbilities: {
					User: {
						readEmailUser: {
							description: "Read user where name is equal to email",
							operation: "SELECT",
							expression: (_client: PrismaClient, row, _context) => {
								return {
									name: row("email"),
								};
							},
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [abilities.User.readEmailUser],
					};
				},
				getContext: () => ({
					role,
					context: {},
				}),
			});

			const notFound = await client.user.findUnique({
				where: {
					id: dummyUser.id,
				},
			});

			expect(notFound).toBeNull();

			const ownUser = await client.user.findUnique({
				where: {
					id: user.id,
				},
			});

			expect(ownUser).toBeDefined();
		});

		it("should be able to allow access using numeric context values", async () => {
			const initial = new PrismaClient();
			const role = `USER_${uuid()}`;

			const item1 = await adminClient.item.create({
				data: {
					value: 50,
				},
			});
			const item2 = await adminClient.item.create({
				data: {
					value: 100,
				},
			});

			const client = await setup({
				prisma: initial,
				customAbilities: {
					Item: {
						readWithValue: {
							description: "Read items with specific value",
							operation: "SELECT",
							expression: (_client: PrismaClient, _row, context) => {
								return {
									value: context("item.value"),
								};
							},
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [abilities.Item.readWithValue],
					};
				},
				getContext: () => ({
					role,
					context: {
						"item.value": item1.value,
					},
				}),
			});

			const results = await client.item.findMany({
				where: {
					id: {
						in: [item1.id, item2.id],
					},
				},
			});

			expect(results.length).toBe(1);
			expect(results[0].id).toBe(item1.id);
		});

		it("should be able to allow access using textual context values", async () => {
			const initial = new PrismaClient();
			const role = `USER_${uuid()}`;

			const user = await adminClient.user.create({
				data: {
					email: `test-user-${uuid()}@example.com`,
				},
			});
			const dummyUser = await adminClient.user.create({
				data: {
					email: `test-user-${uuid()}@example.com`,
				},
			});

			const client = await setup({
				prisma: initial,
				customAbilities: {
					User: {
						readOwnEmail: {
							description: "Read own user",
							operation: "SELECT",
							expression: (_client: PrismaClient, _row, context) => {
								return {
									email: context("user.email"),
								};
							},
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [abilities.User.readOwnEmail],
					};
				},
				getContext: () => ({
					role,
					context: {
						"user.email": user.email,
					},
				}),
			});

			const notFound = await client.user.findUnique({
				where: {
					id: dummyUser.id,
				},
			});

			expect(notFound).toBeNull();

			const ownUser = await client.user.findUnique({
				where: {
					id: user.id,
				},
			});

			expect(ownUser).toBeDefined();
		});

		it("should correctly escape single quotes", async () => {
			const initial = new PrismaClient();
			const role = `USER_${uuid()}`;

			const user = await adminClient.user.create({
				data: {
					name: "Al'Akir",
					email: `test-user-${uuid()}@example.com`,
				},
			});
			const dummyUser = await adminClient.user.create({
				data: {
					email: `test-user-${uuid()}@example.com`,
				},
			});

			const client = await setup({
				prisma: initial,
				customAbilities: {
					User: {
						singleQuoteSelect: {
							description: "Test ability",
							operation: "SELECT",
							expression: () => {
								return {
									name: "Al'Akir",
								};
							},
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [abilities.User.singleQuoteSelect],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			expect(
				await client.user.findUnique({
					where: {
						id: dummyUser.id,
					},
				}),
			).toBeNull();

			const exists = await client.user.findUnique({
				where: {
					id: user.id,
				},
			});

			expect(exists).toBeDefined();
		});

		it("should not allow injection attacks on numeric types", async () => {
			const initial = new PrismaClient();
			const role = `USER_${uuid()}`;

			const client = await expect(
				setup({
					prisma: initial,
					customAbilities: {
						User: {
							numericIdSelect: {
								description: "Test ability",
								operation: "SELECT",
								expression: () => {
									return {
										id: "escape'--",
									};
								},
							},
						},
					},
					getRoles(abilities) {
						return {
							[role]: [abilities.User.numericIdSelect],
						};
					},
					getContext: () => ({
						role,
					}),
				}),
			).rejects.toThrow("Numeric fields can only be queried with numbers");
		});

		it("should not allow injection attacks on row values", async () => {
			const initial = new PrismaClient();
			const role = `USER_${uuid()}`;

			const client = await expect(
				setup({
					prisma: initial,
					customAbilities: {
						User: {
							columndEscapeSelect: {
								description: "Test ability",
								operation: "SELECT",
								expression: (_client, row) => {
									return {
										name: row(`escape"--`),
									};
								},
							},
						},
					},
					getRoles(abilities) {
						return {
							[role]: [abilities.User.columndEscapeSelect],
						};
					},
					getContext: () => ({
						role,
					}),
				}),
			).rejects.toThrow("Invalid field name");
		});
	});

	describe("using a Prisma client query as an expression", () => {
		it("should be able to allow access using static values", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const label = `test-label-${uuid()}`;

			const client = await setup({
				prisma: initial,
				customAbilities: {
					Post: {
						customCreateAbility: {
							description: "Read where tag label exists with a specific value",
							operation: "INSERT",
							// expression: "title = 'test'",
							//expression: EXISTS(SELECT 1 FROM "Post" WHERE "Post"."title" = 'test'),
							expression: (client: PrismaClient) => {
								return client.tag.findFirst({
									where: {
										label,
									},
								});
							},
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.customCreateAbility, abilities.Post.read, abilities.Tag.read, abilities.Tag.create],
					};
				},
				getContext: () => ({
					role,
					context: {
						"tag.title": "test",
					},
				}),
			});

			const testTitle = `test_${uuid()}`;

			await expect(
				client.post.create({
					data: {
						title: testTitle,
					},
				}),
			).rejects.toThrow();

			await client.tag.create({
				data: {
					label,
				},
			});

			const post = await client.post.create({
				data: {
					title: testTitle,
				},
			});

			expect(post.id).toBeDefined();
		});

		it("should be able to allow access using textual row values", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const client = await setup({
				prisma: initial,
				customAbilities: {
					Post: {
						customCreateAbility: {
							description: "Create posts where there is already a tag label with the same title",
							operation: "INSERT",
							expression: (client: PrismaClient, row) => {
								return client.tag.findFirst({
									where: {
										label: row("title"),
									},
								});
							},
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.customCreateAbility, abilities.Post.read, abilities.Tag.read, abilities.Tag.create],
					};
				},
				getContext: () => ({
					role,
					context: {},
				}),
			});

			const testTitle = `test_${uuid()}`;

			await expect(
				client.post.create({
					data: {
						title: testTitle,
					},
				}),
			).rejects.toThrow();

			await client.tag.create({
				data: {
					label: testTitle,
				},
			});

			const post = await client.post.create({
				data: {
					title: testTitle,
				},
			});

			expect(post.id).toBeDefined();
		});

		it("should be able to allow access using numeric row values", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const testTitle = `test_${uuid()}`;
			const post = await adminClient.post.create({
				data: {
					title: testTitle,
				},
			});
			const item = await adminClient.item.create({
				data: {
					value: 9999999999,
				},
			});

			const client = await setup({
				prisma: initial,
				customAbilities: {
					Post: {
						customValueReadAbility: {
							description: "Read posts where there is an item with the same value as the post id",
							operation: "SELECT",
							expression: (client: PrismaClient, row) => {
								return client.item.findFirst({
									where: {
										id: item.id,
										value: row("id"),
									},
								});
							},
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [
							abilities.Post.customValueReadAbility,
							abilities.Item.read,
							abilities.Tag.read,
							abilities.Tag.create,
						],
					};
				},
				getContext: () => ({
					role,
					context: {},
				}),
			});

			await expect(client.post.findFirstOrThrow({ where: { id: post.id } })).rejects.toThrow();

			await adminClient.item.update({
				where: {
					id: item.id,
				},
				data: {
					value: {
						set: post.id,
					},
				},
			});

			const foundPost = await client.post.findFirstOrThrow({
				where: { id: post.id },
			});

			expect(foundPost.id).toBeDefined();
		});

		it("should be able to allow access using a textual context value", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const testTitle = `test_${uuid()}`;

			const client = await setup({
				prisma: initial,
				customAbilities: {
					Post: {
						customCreateAbility: {
							description: "Create posts where there is already a tag label with the same title",
							operation: "INSERT",
							expression: (client: PrismaClient, _row, context) => {
								return client.tag.findFirst({
									where: {
										label: context("post.title"),
									},
								});
							},
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.customCreateAbility, abilities.Post.read, abilities.Tag.read, abilities.Tag.create],
					};
				},
				getContext: () => ({
					role,
					context: {
						"post.title": testTitle,
					},
				}),
			});

			await expect(
				client.post.create({
					data: {
						title: testTitle,
					},
				}),
			).rejects.toThrow();

			await client.tag.create({
				data: {
					label: testTitle,
				},
			});

			const post = await client.post.create({
				data: {
					title: testTitle,
				},
			});

			expect(post.id).toBeDefined();
		});
	});
});
