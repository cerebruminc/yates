import { PrismaClient } from "@prisma/client";
import _ from "lodash";
import { v4 as uuid } from "uuid";
import { setup } from "../../src";

jest.setTimeout(30000);

let adminClient: PrismaClient;

beforeAll(async () => {
	adminClient = new PrismaClient();

	const roles = ["USER", "ORGANIZATION_ADMIN", "ADMIN"];

	for (const role of roles) {
		await adminClient.role.upsert({
			where: {
				name: role,
			},
			create: {
				name: role,
			},
			update: {
				name: role,
			},
		});
	}
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
							expression: (_client: PrismaClient, row, _context) => ({
								name: {
									equals: row("email"),
								},
							}),
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [abilities.User.readEmailUser as any],
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
									value: context("item.value") as any as number,
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
									email: context("user.email") as string,
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

		it("should allow create checks with relation filters when related records are connected", async () => {
			const initial = new PrismaClient();
			const role = `USER_${uuid()}`;

			const user = await adminClient.user.create({
				data: {
					email: `test-user-${uuid()}@example.com`,
				},
			});
			const other = await adminClient.user.create({
				data: {
					email: `test-user-${uuid()}@example.com`,
				},
			});

			const client = await setup({
				prisma: initial,
				customAbilities: {
					Post: {
						createPostForAuthorEmail: {
							description: "Create post for a specific author email",
							operation: "INSERT",
							expression: (_client, _row, context) => ({
								author: {
									email: context("user.email") as string,
								},
							}),
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.createPostForAuthorEmail as any],
					};
				},
				getContext: () => ({
					role,
					context: {
						"user.email": user.email,
					},
				}),
			});

			const post = await client.post.create({
				data: {
					title: `test-post-${uuid()}`,
					authorId: user.id,
				},
			});

			expect(post).toBeDefined();

			await expect(
				client.post.create({
					data: {
						title: `test-post-${uuid()}`,
						authorId: other.id,
					},
				}),
			).rejects.toThrow();
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

			const client = await setup({
				prisma: initial,
				customAbilities: {
					Item: {
						numericFieldSelect: {
							description: "Test ability",
							operation: "SELECT",
							expression: () => {
								return {
									// We're intentionally using the wrong type to run this test
									stock: "escape'--" as any as number,
								};
							},
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [abilities.Item.numericFieldSelect],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			await expect(client.item.findMany()).rejects.toThrow();
		});

		it("should not allow injection attacks on row values", async () => {
			const initial = new PrismaClient();
			const role = `USER_${uuid()}`;

			const client = await setup({
				prisma: initial,
				customAbilities: {
					User: {
						columndEscapeSelect: {
							description: "Test ability",
							operation: "SELECT",
							expression: (_client, row) => {
								return {
									// We're intentionally using the wrong type to run this test
									name: {
										equals: row(`escape"--` as any),
									},
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
			});

			await expect(client.user.findMany()).rejects.toThrow(
				"Could not retrieve field data",
			);
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
										// We're intentionally using the wrong type to run this test
										in: context("post.title") as any as string[],
									},
								};
							},
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [
							abilities.Post.customCreateAbility as any,
							abilities.Post.read,
						],
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

	describe("using relational where clauses as expressions", () => {
		it("should be able to allow access using static values", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;
			const allowedTitle = `allowed-${uuid()}`;

			const client = await setup({
				prisma: initial,
				customAbilities: {
					Post: {
						customCreateAbility: {
							description: "Create posts with a specific title",
							operation: "INSERT",
							expression: () => ({
								title: allowedTitle,
							}),
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [
							abilities.Post.customCreateAbility as any,
							abilities.Post.read,
						],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			await expect(
				client.post.create({
					data: {
						title: `invalid-${uuid()}`,
					},
				}),
			).rejects.toThrow();

			const post = await client.post.create({
				data: {
					title: allowedTitle,
				},
			});

			expect(post.id).toBeDefined();
		});

		it("should be able to allow access using static values and the `in` keyword", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;
			const title1 = `allowed-${uuid()}`;
			const title2 = `allowed-${uuid()}`;

			const client = await setup({
				prisma: initial,
				customAbilities: {
					Post: {
						customCreateAbility: {
							description: "Create posts with allowed titles",
							operation: "INSERT",
							expression: () => ({
								title: {
									in: [title1, title2],
								},
							}),
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [
							abilities.Post.customCreateAbility as any,
							abilities.Post.read,
						],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			await expect(
				client.post.create({
					data: {
						title: `invalid-${uuid()}`,
					},
				}),
			).rejects.toThrow();

			const post = await client.post.create({
				data: {
					title: title1,
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
					User: {
						customCreateAbility: {
							description: "Create user where name equals email",
							operation: "INSERT",
							expression: (_client, row) => ({
								name: {
									equals: row("email"),
								},
							}),
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [
							abilities.User.customCreateAbility as any,
							abilities.User.read,
						],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			await expect(
				client.user.create({
					data: {
						email: `test-${uuid()}@example.com`,
						name: "Different",
					},
				}),
			).rejects.toThrow();

			const matchingEmail = `test-${uuid()}@example.com`;
			const user = await client.user.create({
				data: {
					email: matchingEmail,
					name: matchingEmail,
				},
			});

			expect(user.id).toBeDefined();
		});

		it("should be able to allow access using numeric row values", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const client = await setup({
				prisma: initial,
				customAbilities: {
					Item: {
						customCreateAbility: {
							description: "Create item where value equals stock",
							operation: "INSERT",
							expression: (_client, row) => ({
								value: {
									equals: row("stock") as any,
								},
							}),
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [
							abilities.Item.customCreateAbility as any,
							abilities.Item.read,
						],
					};
				},
				getContext: () => ({
					role,
				}),
			});

			await expect(
				client.item.create({
					data: {
						value: 5,
						stock: 4,
					},
				}),
			).rejects.toThrow();

			const item = await client.item.create({
				data: {
					value: 3,
					stock: 3,
				},
			});

			expect(item.id).toBeDefined();
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
							description: "Create posts with a contextual title",
							operation: "INSERT",
							expression: (_client, _row, context) => ({
								title: context("post.title") as string,
							}),
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [
							abilities.Post.customCreateAbility as any,
							abilities.Post.read,
						],
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
						title: `invalid-${uuid()}`,
					},
				}),
			).rejects.toThrow();

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
							description:
								"Read user that made a post with a tag labeled with the tag context value",
							operation: "SELECT",
							expression: (_client, _row, context) => ({
								posts: {
									some: {
										tags: {
											some: {
												label: context("ctx.label") as string,
											},
										},
									},
								},
							}),
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [
							abilities.Post.create,
							abilities.Post.read,
							abilities.User.customReadAbility as any,
							abilities.Tag.read,
						],
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
							expression: (_client, _row, context) => ({
								posts: {
									some: {
										tags: {
											some: {
												posts: {
													some: {
														title: context("ctx.title") as string,
													},
												},
											},
										},
									},
								},
							}),
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [
							abilities.Post.create,
							abilities.Post.read,
							abilities.User.customReadAbility as any,
							abilities.Tag.read,
						],
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

		it("should be able to handle expressions that are multi-level objects that traverse a 1:1 relationship", async () => {
			const initial = new PrismaClient();

			const role = `USER_${uuid()}`;

			const org1 = await adminClient.organization.create({
				data: {
					name: `test org ${uuid()}`,
				},
			});
			const org2 = await adminClient.organization.create({
				data: {
					name: `test org ${uuid()}`,
				},
			});

			// Setup a user that is an organization admin for org1 and a regular user for org2
			const user = await adminClient.user.create({
				data: {
					email: `test-user-${uuid()}@example.com`,
					roleAssignment: {
						create: [
							{
								role: {
									connect: {
										name: "ORGANIZATION_ADMIN",
									},
								},
								organization: {
									connect: {
										id: org1.id,
									},
								},
							},
							{
								role: {
									connect: {
										name: "USER",
									},
								},
								organization: {
									connect: {
										id: org2.id,
									},
								},
							},
						],
					},
				},
				include: {
					roleAssignment: true,
				},
			});

			const client = await setup({
				prisma: initial,
				customAbilities: {
					Organization: {
						customUpdateAbility: {
							description:
								"Update organization where user has ORGANIZATION_ADMIN role",
							operation: "UPDATE",
							expression: (_client, _row, context) => ({
								roleAssignment: {
									some: {
										userId: context("ctx.user_id") as string,
										role: {
											name: "ORGANIZATION_ADMIN",
										},
									},
								},
							}),
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [
							abilities.Organization.read,
							abilities.Organization.customUpdateAbility as any,
							abilities.RoleAssignment.read,
							abilities.Role.read,
						],
					};
				},
				getContext: () => ({
					role,
					context: {
						"ctx.user_id": user.id,
					},
				}),
			});

			// An update to org2 should fail, as the user only has the USER role for that organization
			await expect(
				client.organization.update({
					where: {
						id: org2.id,
					},
					data: {
						name: `Acme Corp ${uuid()}`,
					},
				}),
			).rejects.toThrow("Record to update not found");

			// An update to org1 should succeed, as the user has the ORGANIZATION_ADMIN role for that organization
			const result = await client.organization.update({
				where: {
					id: org1.id,
				},
				data: {
					name: `Acme Corp ${uuid()}`,
				},
			});

			expect(result.id).toBe(org1.id);
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
							description: "Create posts with titles from a known set",
							operation: "INSERT",
							expression: (_client, _row, context) => ({
								title: {
									in: context("post.title") as any as string[],
								},
							}),
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [
							abilities.Post.customCreateAbility as any,
							abilities.Post.read,
						],
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
						title: `invalid-${uuid()}`,
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
});
