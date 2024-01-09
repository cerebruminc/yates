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
			).rejects.toThrow("Could not retrieve field data");
		});

		it("should be able to handle context values that are arrays", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const testTitle1 = `test_${uuid()}`;
			const testTitle2 = `test_${uuid()}`;

			const client = await setup({
				prisma: initial,
				customAbilities: {
					Post: {
						customCreateAbility: {
							description: "Create posts with a specified title",
							operation: "INSERT",
							expression: (_client: PrismaClient, _row, context) => {
								return {
									title: {
										in: context("post.title") as any as string[],
									},
								};
							},
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
					context: {
						"post.title": [testTitle1, testTitle2],
					},
				}),
			});

			await expect(
				client.post.create({
					data: {
						title: "foobar",
					},
				}),
			).rejects.toThrow();

			const post1 = await client.post.create({
				data: {
					title: testTitle1,
				},
			});

			expect(post1.id).toBeDefined();

			const post2 = await client.post.create({
				data: {
					title: testTitle2,
				},
			});

			expect(post2.id).toBeDefined();
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

		// This test case creates an ability that uses a nested "some" clause that filters on a related model
		it("should be able to handle expressions that are multi-level objects", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const client = await setup({
				prisma: initial,
				customAbilities: {
					User: {
						customReadAbility: {
							description: "Read user that made a post with a tag labeled with the tag context value",
							operation: "SELECT",
							expression: (client: PrismaClient, row, context) => {
								return client.post.findFirst({
									where: {
										authorId: row("id"),
										tags: {
											some: {
												label: context("ctx.label"),
											},
										},
									},
								});
							},
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.create, abilities.Post.read, abilities.User.customReadAbility, abilities.Tag.read],
					};
				},
				getContext: () => ({
					role,
					context: {
						"ctx.label": "foo",
					},
				}),
			});

			const testTitle = `test_${uuid()}`;

			const user1 = await adminClient.user.create({
				data: {
					email: `test-user-${uuid()}@example.com`,
					posts: {
						create: {
							title: testTitle,
							tags: {
								create: {
									label: "foo",
								},
							},
						},
					},
				},
			});

			const user2 = await adminClient.user.create({
				data: {
					email: `test-user-${uuid()}@example.com`,
					posts: {
						create: {
							title: testTitle,
							tags: {
								create: {
									label: "bar",
								},
							},
						},
					},
				},
			});

			const result1 = await client.user.findFirst({
				where: {
					id: user1.id,
				},
			});

			expect(result1).not.toBeNull();

			const result2 = await client.user.findFirst({
				where: {
					id: user2.id,
				},
			});

			expect(result2).toBeNull();
		});

		// This test case creates an ability that uses multiple nested "some" clauses that span models
		it("should be able to handle expressions that are deep multi-level objects", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const testTitle = `test_${uuid()}`;

			const client = await setup({
				prisma: initial,
				customAbilities: {
					User: {
						customReadAbility: {
							description:
								"Read user that made a post with a tag that is also attached to a post with the title context value",
							operation: "SELECT",
							expression: (client: PrismaClient, row, context) => {
								return client.post.findFirst({
									where: {
										authorId: row("id"),
										tags: {
											some: {
												posts: {
													some: {
														title: context("ctx.title"),
													},
												},
											},
										},
									},
								});
							},
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.create, abilities.Post.read, abilities.User.customReadAbility, abilities.Tag.read],
					};
				},
				getContext: () => ({
					role,
					context: {
						"ctx.title": testTitle,
					},
				}),
			});

			const user1 = await adminClient.user.create({
				data: {
					email: `test-user-${uuid()}@example.com`,
					posts: {
						create: {
							title: testTitle,
							tags: {
								create: {
									label: uuid(),
								},
							},
						},
					},
				},
				include: {
					posts: {
						include: {
							tags: true,
						},
					},
				},
			});

			await adminClient.post.create({
				data: {
					title: testTitle,
					tags: {
						connect: {
							id: user1.posts[0].tags[0].id,
						},
					},
				},
			});

			const user2 = await adminClient.user.create({
				data: {
					email: `test-user-${uuid()}@example.com`,
					posts: {
						create: {
							title: `test_${uuid()}`,
							tags: {
								create: {
									label: "bar",
								},
							},
						},
					},
				},
			});

			const result1 = await client.user.findFirst({
				where: {
					id: user1.id,
				},
			});

			expect(result1).not.toBeNull();

			const result2 = await client.user.findFirst({
				where: {
					id: user2.id,
				},
			});

			expect(result2).toBeNull();
		});

		it("should be able to handle context values that are arrays", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const testTitle1 = `test_${uuid()}`;
			const testTitle2 = `test_${uuid()}`;

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
										label: {
											in: context("post.title") as any as string[],
										},
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
						"post.title": [testTitle1, testTitle2],
					},
				}),
			});

			await expect(
				client.post.create({
					data: {
						title: testTitle1,
					},
				}),
			).rejects.toThrow();

			await client.tag.create({
				data: {
					label: testTitle1,
				},
			});

			const post1 = await client.post.create({
				data: {
					title: testTitle1,
				},
			});

			expect(post1.id).toBeDefined();

			await client.tag.create({
				data: {
					label: testTitle2,
				},
			});

			const post2 = await client.post.create({
				data: {
					title: testTitle2,
				},
			});

			expect(post2.id).toBeDefined();
		});
	});
});
