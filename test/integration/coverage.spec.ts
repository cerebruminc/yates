import { PrismaClient } from "@prisma/client";
import { v4 as uuid } from "uuid";
import { sanitizeSlug, setup } from "../../src";

jest.setTimeout(30000);

let adminClient: PrismaClient;

beforeAll(async () => {
	adminClient = new PrismaClient();
});

afterAll(async () => {
	await adminClient.$disconnect();
});

const createClient = async (
	role: string,
	customAbilities: Parameters<typeof setup>[0]["customAbilities"],
	selectAbilities: (abilities: any) => any[],
	context: Record<string, string | number | string[]> = {},
) => {
	return setup({
		prisma: new PrismaClient(),
		customAbilities,
		getRoles: (abilities) => ({
			[role]: selectAbilities(abilities),
		}),
		getContext: () => ({
			role,
			context,
		}),
	});
};

describe("coverage targets", () => {
	it("should combine multiple read abilities with OR", async () => {
		const role = `USER_${uuid()}`;
		const titleA = `post-a-${uuid()}`;
		const titleB = `post-b-${uuid()}`;

		await adminClient.post.create({ data: { title: titleA } });
		await adminClient.post.create({ data: { title: titleB } });

		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				Post: {
					readTitleA: {
						description: "Read title A",
						operation: "SELECT",
						expression: () => ({ title: titleA }),
					},
					readTitleB: {
						description: "Read title B",
						operation: "SELECT",
						expression: () => ({ title: titleB }),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [
					abilities.Post.readTitleA as any,
					abilities.Post.readTitleB as any,
				],
			}),
			getContext: () => ({ role, context: {} }),
		});

		const results = await client.post.findMany({ where: { published: false } });
		expect(results.map((r) => r.title).sort()).toEqual([titleA, titleB].sort());
	});

	it("should expose sanitizeSlug behavior in integration coverage", () => {
		expect(sanitizeSlug("Role--Name!")).toBe("role__name");
	});

	it("should drop related selections when read ability is missing", async () => {
		const role = `USER_${uuid()}`;
		const author = await adminClient.user.create({
			data: { email: `author-${uuid()}@example.com` },
		});
		await adminClient.post.create({
			data: { title: `post-${uuid()}`, authorId: author.id },
		});

		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				Post: {
					readPost: {
						description: "Read posts",
						operation: "SELECT",
						expression: {},
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [abilities.Post.readPost as any],
			}),
			getContext: () => ({ role, context: {} }),
		});

		const results = await client.post.findMany({ include: { author: true } });
		expect(results.length).toBeGreaterThan(0);
		expect("author" in results[0]).toBe(false);
	});

	it("should reject invalid context array entries", async () => {
		const role = `USER_${uuid()}`;
		const client = await setup({
			prisma: new PrismaClient(),
			getRoles: (abilities) => ({
				[role]: [abilities.Post.read],
			}),
			getContext: () => ({
				role,
				context: {
					"ctx.bad": ["ok", 1 as unknown as string],
				},
			}),
		});

		await expect(client.post.findMany()).rejects.toThrow(
			'Context variable "ctx.bad" must be an array of strings.',
		);
	});

	it("should reject invalid context value types", async () => {
		const role = `USER_${uuid()}`;
		const client = await setup({
			prisma: new PrismaClient(),
			getRoles: (abilities) => ({
				[role]: [abilities.Post.read],
			}),
			getContext: () => ({
				role,
				context: {
					"ctx.bad": { nested: true } as unknown as string,
				},
			}),
		});

		await expect(client.post.findMany()).rejects.toThrow(
			'Context variable "ctx.bad" must be a string, number or array.',
		);
	});

	it("should support scalar filter variants in create checks", async () => {
		const role = `USER_${uuid()}`;
		const sku = "sku-1";

		const client = await createClient(
			role,
			{
				Item: {
					createWithFilters: {
						description: "Create item with scalar filters",
						operation: "INSERT",
						expression: (_client, row) => ({
							AND: [
								{ value: { lt: 10 } },
								{ value: { gt: 1 } },
								{ stock: { lte: 5 } },
								{ stock: { gte: 0 } },
								{ stock: { not: 99 } },
								{ SKU: { contains: "sku" } },
								{ SKU: { startsWith: "sku" } },
								{ SKU: { endsWith: "1" } },
								{ SKU: { in: ["sku-1", "sku-2"] } },
								{ SKU: { notIn: ["sku-9"] } },
								{ SKU: { equals: row("SKU") } },
							],
						}),
					},
				},
			},
			(abilities) => [abilities.Item.createWithFilters],
		);

		const item = await client.item.create({
			data: {
				value: 5,
				stock: 2,
				SKU: sku,
			},
		});
		expect(item).toBeDefined();
	});

	it("should support OR/NOT create filters", async () => {
		const role = `USER_${uuid()}`;

		const client = await createClient(
			role,
			{
				Item: {
					createWithOrNot: {
						description: "Create item with OR/NOT",
						operation: "INSERT",
						expression: () => ({
							OR: [{ SKU: "sku-1" }, { SKU: "sku-2" }],
							NOT: { stock: 0 },
						}),
					},
				},
			},
			(abilities) => [abilities.Item.createWithOrNot],
		);

		await expect(
			client.item.create({
				data: {
					value: 3,
					stock: 1,
					SKU: "sku-1",
				},
			}),
		).resolves.toBeDefined();

		await expect(
			client.item.create({
				data: {
					value: 3,
					stock: 0,
					SKU: "sku-1",
				},
			}),
		).rejects.toThrow();
	});

	it("should throw when row helper references a missing field", async () => {
		const role = `USER_${uuid()}`;
		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				User: {
					readBroken: {
						description: "Broken row ref",
						operation: "SELECT",
						expression: (_client, row) => ({
							email: { equals: row("notAField" as any) },
						}),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [abilities.User.readBroken as any],
			}),
			getContext: () => ({ role, context: {} }),
		});

		await expect(client.user.findMany()).rejects.toThrow(
			"Could not retrieve field data from Prisma Client",
		);
	});

	it("should support relation filters with is/isNot null in create checks", async () => {
		const role = `USER_${uuid()}`;
		const user = await adminClient.user.create({
			data: { email: `author-${uuid()}@example.com` },
		});

		const clientIsNull = await createClient(
			role,
			{
				Post: {
					createWithoutAuthor: {
						description: "Create without author",
						operation: "INSERT",
						expression: () => ({
							author: { is: null },
						}),
					},
				},
			},
			(abilities) => [abilities.Post.createWithoutAuthor],
		);

		await expect(
			clientIsNull.post.create({ data: { title: `no-author-${uuid()}` } }),
		).resolves.toBeDefined();

		await expect(
			clientIsNull.post.create({
				data: { title: `with-author-${uuid()}`, authorId: user.id },
			}),
		).rejects.toThrow();

		const clientIsNotNull = await createClient(
			role,
			{
				Post: {
					createWithAuthor: {
						description: "Create with author",
						operation: "INSERT",
						expression: () => ({
							author: { isNot: null },
						}),
					},
				},
			},
			(abilities) => [abilities.Post.createWithAuthor],
		);

		await expect(
			clientIsNotNull.post.create({
				data: { title: `with-author-${uuid()}`, authorId: user.id },
			}),
		).resolves.toBeDefined();

		await expect(
			clientIsNotNull.post.create({ data: { title: `no-author-${uuid()}` } }),
		).rejects.toThrow();
	});

	it("should support list relation operators in create checks", async () => {
		const role = `USER_${uuid()}`;
		const tagFoo1 = await adminClient.tag.create({
			data: { label: `foo-${uuid()}` },
		});
		const tagFoo2 = await adminClient.tag.create({
			data: { label: `foo-${uuid()}` },
		});
		const tagBar = await adminClient.tag.create({
			data: { label: `bar-${uuid()}` },
		});

		const clientSome = await createClient(
			role,
			{
				Post: {
					createWithSomeFoo: {
						description: "Tags some foo",
						operation: "INSERT",
						expression: () => ({
							tags: { some: { label: { contains: "foo" } } },
						}),
					},
				},
			},
			(abilities) => [abilities.Post.createWithSomeFoo],
		);

		await expect(
			clientSome.post.create({
				data: {
					title: `some-foo-${uuid()}`,
					tags: { connect: [{ id: tagFoo1.id }] },
				},
			}),
		).resolves.toBeDefined();

		await expect(
			clientSome.post.create({ data: { title: `some-none-${uuid()}` } }),
		).rejects.toThrow();

		const clientNone = await createClient(
			role,
			{
				Post: {
					createWithNoBar: {
						description: "Tags none bar",
						operation: "INSERT",
						expression: () => ({
							tags: { none: { label: { contains: "bar" } } },
						}),
					},
				},
			},
			(abilities) => [abilities.Post.createWithNoBar],
		);

		await expect(
			clientNone.post.create({
				data: {
					title: `none-bar-${uuid()}`,
					tags: { connect: [{ id: tagFoo1.id }] },
				},
			}),
		).resolves.toBeDefined();

		await expect(
			clientNone.post.create({ data: { title: `none-empty-${uuid()}` } }),
		).resolves.toBeDefined();

		const clientEvery = await createClient(
			role,
			{
				Post: {
					createWithAllFoo: {
						description: "Tags every foo",
						operation: "INSERT",
						expression: () => ({
							tags: { every: { label: { contains: "foo" } } },
						}),
					},
				},
			},
			(abilities) => [abilities.Post.createWithAllFoo],
		);

		await expect(
			clientEvery.post.create({
				data: {
					title: `every-foo-${uuid()}`,
					tags: { connect: [{ id: tagFoo1.id }, { id: tagFoo2.id }] },
				},
			}),
		).resolves.toBeDefined();

		await expect(
			clientEvery.post.create({ data: { title: `every-empty-${uuid()}` } }),
		).resolves.toBeDefined();

		await expect(
			clientEvery.post.create({
				data: {
					title: `every-bar-${uuid()}`,
					tags: { connect: [{ id: tagBar.id }] },
				},
			}),
		).rejects.toThrow();
	});

	it("should enforce updateMany/deleteMany abilities", async () => {
		const role = `USER_${uuid()}`;
		const allowedTitle = `allowed-${uuid()}`;
		const deniedTitle = `denied-${uuid()}`;

		await adminClient.post.create({ data: { title: allowedTitle } });
		await adminClient.post.create({ data: { title: deniedTitle } });

		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				Post: {
					updateAllowed: {
						description: "Update allowed",
						operation: "UPDATE",
						expression: () => ({ title: allowedTitle }),
					},
					deleteAllowed: {
						description: "Delete allowed",
						operation: "DELETE",
						expression: () => ({ title: allowedTitle }),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [
					abilities.Post.updateAllowed as any,
					abilities.Post.deleteAllowed as any,
				],
			}),
			getContext: () => ({ role, context: {} }),
		});

		const updateResult = await client.post.updateMany({
			data: { published: true },
		});
		expect(updateResult.count).toBe(1);

		const deleteResult = await client.post.deleteMany({});
		expect(deleteResult.count).toBe(1);
	});

	it("should deny findUniqueOrThrow without read abilities", async () => {
		const role = `USER_${uuid()}`;
		const post = await adminClient.post.create({
			data: { title: `no-read-${uuid()}` },
		});

		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {},
			getRoles: () => ({
				[role]: [],
			}),
			getContext: () => ({ role, context: {} }),
		});

		await expect(
			client.post.findUniqueOrThrow({ where: { id: post.id } }),
		).rejects.toThrow();
	});

	it("should deny updateMany/deleteMany without abilities", async () => {
		const role = `USER_${uuid()}`;
		await adminClient.post.create({ data: { title: `deny-${uuid()}` } });

		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {},
			getRoles: () => ({
				[role]: [],
			}),
			getContext: () => ({ role, context: {} }),
		});

		const updateResult = await client.post.updateMany({
			data: { published: true },
		});
		expect(updateResult.count).toBe(0);

		const deleteResult = await client.post.deleteMany({});
		expect(deleteResult.count).toBe(0);
	});

	it("should validate nested write operations", async () => {
		const role = `USER_${uuid()}`;
		const user = await adminClient.user.create({
			data: { email: `nested-${uuid()}@example.com` },
		});
		const postUpdate = await adminClient.post.create({
			data: { title: `update-${uuid()}`, authorId: user.id },
		});
		const postDelete = await adminClient.post.create({
			data: { title: `delete-${uuid()}`, authorId: user.id },
		});
		await adminClient.post.create({
			data: { title: `bulk-${uuid()}`, authorId: user.id },
		});

		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				User: {
					updateSelf: {
						description: "Update user",
						operation: "UPDATE",
						expression: () => ({ id: user.id }),
					},
				},
				Post: {
					createPost: {
						description: "Create post",
						operation: "INSERT",
						expression: () => ({}),
					},
					updatePost: {
						description: "Update post",
						operation: "UPDATE",
						expression: () => ({ authorId: user.id }),
					},
					deletePost: {
						description: "Delete post",
						operation: "DELETE",
						expression: () => ({ authorId: user.id }),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [
					abilities.User.updateSelf,
					abilities.Post.createPost as any,
					abilities.Post.updatePost as any,
					abilities.Post.deletePost as any,
				],
			}),
			getContext: () => ({ role, context: {} }),
		});

		await expect(
			client.user.update({
				where: { id: user.id },
				data: {
					posts: {
						create: { title: `created-${uuid()}` },
						update: {
							where: { id: postUpdate.id },
							data: { title: `updated-${uuid()}` },
						},
						updateMany: {
							where: { title: { contains: "bulk" } },
							data: { published: true },
						},
						upsert: {
							where: { id: -1 },
							update: { title: `nope-${uuid()}` },
							create: { title: `upsert-${uuid()}` },
						},
						delete: { id: postDelete.id },
						deleteMany: { title: { contains: "delete" } },
					},
				},
			}),
		).resolves.toBeDefined();
	});

	it("should allow upsert create path when update is not allowed", async () => {
		const role = `USER_${uuid()}`;
		const title = `upsert-${uuid()}`;

		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				Post: {
					createOnly: {
						description: "Create only",
						operation: "INSERT",
						expression: () => ({}),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [abilities.Post.createOnly as any],
			}),
			getContext: () => ({ role, context: {} }),
		});

		const result = await client.post.upsert({
			where: { id: -1 },
			create: { title },
			update: { title: `${title}-updated` },
		});

		expect(result.title).toBe(title);
	});

	it("should allow upsert update path when update is allowed", async () => {
		const role = `USER_${uuid()}`;
		const post = await adminClient.post.create({
			data: { title: `existing-${uuid()}` },
		});

		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				Post: {
					updateExisting: {
						description: "Update existing",
						operation: "UPDATE",
						expression: () => ({ id: post.id }),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [abilities.Post.updateExisting as any],
			}),
			getContext: () => ({ role, context: {} }),
		});

		const result = await client.post.upsert({
			where: { id: post.id },
			create: { title: `should-not-${uuid()}` },
			update: { title: `updated-${uuid()}` },
		});

		expect(result.id).toBe(post.id);
	});

	it("should allow createMany when create ability is present", async () => {
		const role = `USER_${uuid()}`;

		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				Post: {
					createPost: {
						description: "Create post",
						operation: "INSERT",
						expression: () => ({}),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [abilities.Post.createPost as any],
			}),
			getContext: () => ({ role, context: {} }),
		});

		const result = await client.post.createMany({
			data: [{ title: `bulk-${uuid()}` }, { title: `bulk-${uuid()}` }],
		});
		expect(result.count).toBe(2);
	});

	it("should reject nested update when update ability is missing", async () => {
		const role = `USER_${uuid()}`;
		const user = await adminClient.user.create({
			data: { email: `nested-miss-${uuid()}@example.com` },
		});
		const post = await adminClient.post.create({
			data: { title: `nested-update-${uuid()}`, authorId: user.id },
		});

		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				User: {
					updateSelf: {
						description: "Update user",
						operation: "UPDATE",
						expression: () => ({ id: user.id }),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [abilities.User.updateSelf],
			}),
			getContext: () => ({ role, context: {} }),
		});

		await expect(
			client.user.update({
				where: { id: user.id },
				data: {
					posts: {
						update: {
							where: { id: post.id },
							data: { title: `nope-${uuid()}` },
						},
					},
				},
			}),
		).rejects.toThrow("Record to update not found");
	});

	it("should reject nested delete when delete ability is missing", async () => {
		const role = `USER_${uuid()}`;
		const user = await adminClient.user.create({
			data: { email: `nested-del-${uuid()}@example.com` },
		});
		const post = await adminClient.post.create({
			data: { title: `nested-delete-${uuid()}`, authorId: user.id },
		});

		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				User: {
					updateSelf: {
						description: "Update user",
						operation: "UPDATE",
						expression: () => ({ id: user.id }),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [abilities.User.updateSelf],
			}),
			getContext: () => ({ role, context: {} }),
		});

		await expect(
			client.user.update({
				where: { id: user.id },
				data: {
					posts: {
						delete: { id: post.id },
					},
				},
			}),
		).rejects.toThrow("Record to delete does not exist");
	});

	it("should allow nested connect when related record is in allowed org IDs", async () => {
		const role = `USER_${uuid()}`;
		const orgAllowed = await adminClient.organization.create({
			data: { name: `org-allowed-${uuid()}` },
		});
		const scopedRole = await adminClient.role.create({
			data: { name: `role-${uuid()}` },
		});
		const sourceUser = await adminClient.user.create({
			data: { email: `source-${uuid()}@example.com` },
		});
		const targetUser = await adminClient.user.create({
			data: { email: `target-${uuid()}@example.com` },
		});
		const assignment = await adminClient.roleAssignment.create({
			data: {
				userId: sourceUser.id,
				organizationId: orgAllowed.id,
				roleId: scopedRole.id,
			},
		});

		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				User: {
					updateSelf: {
						description: "Update self",
						operation: "UPDATE",
						expression: () => ({ id: targetUser.id }),
					},
				},
				RoleAssignment: {
					updateAllowedOrgs: {
						description: "Update role assignments in allowed orgs",
						operation: "UPDATE",
						expression: (_client, _row, context) => ({
							organizationId: { in: context("org.ids") as string[] },
						}),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [
					abilities.User.updateSelf,
					abilities.RoleAssignment.updateAllowedOrgs as any,
				],
			}),
			getContext: () => ({
				role,
				context: {
					"org.ids": [orgAllowed.id],
				},
			}),
		});

		await expect(
			client.user.update({
				where: { id: targetUser.id },
				data: {
					roleAssignment: {
						connect: { id: assignment.id },
					},
				},
			}),
		).resolves.toBeDefined();

		const updatedAssignment = await adminClient.roleAssignment.findUnique({
			where: { id: assignment.id },
		});
		expect(updatedAssignment?.userId).toBe(targetUser.id);
	});

	it("should deny nested connect when related record is outside allowed org IDs", async () => {
		const role = `USER_${uuid()}`;
		const orgAllowed = await adminClient.organization.create({
			data: { name: `org-allowed-${uuid()}` },
		});
		const orgDenied = await adminClient.organization.create({
			data: { name: `org-denied-${uuid()}` },
		});
		const scopedRole = await adminClient.role.create({
			data: { name: `role-${uuid()}` },
		});
		const sourceUser = await adminClient.user.create({
			data: { email: `source-${uuid()}@example.com` },
		});
		const targetUser = await adminClient.user.create({
			data: { email: `target-${uuid()}@example.com` },
		});
		const assignment = await adminClient.roleAssignment.create({
			data: {
				userId: sourceUser.id,
				organizationId: orgDenied.id,
				roleId: scopedRole.id,
			},
		});

		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				User: {
					updateSelf: {
						description: "Update self",
						operation: "UPDATE",
						expression: () => ({ id: targetUser.id }),
					},
				},
				RoleAssignment: {
					updateAllowedOrgs: {
						description: "Update role assignments in allowed orgs",
						operation: "UPDATE",
						expression: (_client, _row, context) => ({
							organizationId: { in: context("org.ids") as string[] },
						}),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [
					abilities.User.updateSelf,
					abilities.RoleAssignment.updateAllowedOrgs as any,
				],
			}),
			getContext: () => ({
				role,
				context: {
					"org.ids": [orgAllowed.id],
				},
			}),
		});

		await expect(
			client.user.update({
				where: { id: targetUser.id },
				data: {
					roleAssignment: {
						connect: { id: assignment.id },
					},
				},
			}),
		).rejects.toThrow("Record to update not found");

		const unchangedAssignment = await adminClient.roleAssignment.findUnique({
			where: { id: assignment.id },
		});
		expect(unchangedAssignment?.userId).toBe(sourceUser.id);
	});

	it("should allow nested connect in create when related record is in allowed org IDs", async () => {
		const role = `USER_${uuid()}`;
		const orgAllowed = await adminClient.organization.create({
			data: { name: `org-allowed-${uuid()}` },
		});
		const scopedRole = await adminClient.role.create({
			data: { name: `role-${uuid()}` },
		});
		const sourceUser = await adminClient.user.create({
			data: { email: `source-${uuid()}@example.com` },
		});
		const assignment = await adminClient.roleAssignment.create({
			data: {
				userId: sourceUser.id,
				organizationId: orgAllowed.id,
				roleId: scopedRole.id,
			},
		});

		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				User: {
					createWithAllowedOrgs: {
						description: "Create users with allowed org connections",
						operation: "INSERT",
						expression: (_client, _row, context) => ({
							roleAssignment: {
								some: {
									organizationId: { in: context("org.ids") as string[] },
								},
							},
						}),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [abilities.User.createWithAllowedOrgs as any],
			}),
			getContext: () => ({
				role,
				context: {
					"org.ids": [orgAllowed.id],
				},
			}),
		});

		const created = await client.user.create({
			data: {
				email: `created-${uuid()}@example.com`,
				roleAssignment: {
					connect: { id: assignment.id },
				},
			},
		});

		const updatedAssignment = await adminClient.roleAssignment.findUnique({
			where: { id: assignment.id },
		});
		expect(updatedAssignment?.userId).toBe(created.id);
	});

	it("should deny nested connect in create when related record is outside allowed org IDs", async () => {
		const role = `USER_${uuid()}`;
		const orgAllowed = await adminClient.organization.create({
			data: { name: `org-allowed-${uuid()}` },
		});
		const orgDenied = await adminClient.organization.create({
			data: { name: `org-denied-${uuid()}` },
		});
		const scopedRole = await adminClient.role.create({
			data: { name: `role-${uuid()}` },
		});
		const sourceUser = await adminClient.user.create({
			data: { email: `source-${uuid()}@example.com` },
		});
		const assignment = await adminClient.roleAssignment.create({
			data: {
				userId: sourceUser.id,
				organizationId: orgDenied.id,
				roleId: scopedRole.id,
			},
		});

		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				User: {
					createWithAllowedOrgs: {
						description: "Create users with allowed org connections",
						operation: "INSERT",
						expression: (_client, _row, context) => ({
							roleAssignment: {
								some: {
									organizationId: { in: context("org.ids") as string[] },
								},
							},
						}),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [abilities.User.createWithAllowedOrgs as any],
			}),
			getContext: () => ({
				role,
				context: {
					"org.ids": [orgAllowed.id],
				},
			}),
		});

		await expect(
			client.user.create({
				data: {
					email: `created-${uuid()}@example.com`,
					roleAssignment: {
						connect: { id: assignment.id },
					},
				},
			}),
		).rejects.toThrow("User.create");

		const unchangedAssignment = await adminClient.roleAssignment.findUnique({
			where: { id: assignment.id },
		});
		expect(unchangedAssignment?.userId).toBe(sourceUser.id);
	});

	it("should allow nested set in update when related post is allowed", async () => {
		const role = `USER_${uuid()}`;
		const sourceUser = await adminClient.user.create({
			data: { email: `source-${uuid()}@example.com` },
		});
		const targetUser = await adminClient.user.create({
			data: { email: `target-${uuid()}@example.com` },
		});
		const postTitle = `set-allowed-${uuid()}`;
		const post = await adminClient.post.create({
			data: {
				title: postTitle,
				authorId: sourceUser.id,
			},
		});

		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				User: {
					updateSelf: {
						description: "Update self",
						operation: "UPDATE",
						expression: () => ({ id: targetUser.id }),
					},
				},
				Post: {
					updateAllowedPosts: {
						description: "Update posts in allowed title set",
						operation: "UPDATE",
						expression: (_client, _row, context) => ({
							title: { in: context("post.titles") as string[] },
						}),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [
					abilities.User.updateSelf,
					abilities.Post.updateAllowedPosts as any,
				],
			}),
			getContext: () => ({
				role,
				context: {
					"post.titles": [postTitle],
				},
			}),
		});

		await expect(
			client.user.update({
				where: { id: targetUser.id },
				data: {
					posts: {
						set: [{ id: post.id }],
					},
				},
			}),
		).resolves.toBeDefined();

		const updatedPost = await adminClient.post.findUnique({
			where: { id: post.id },
		});
		expect(updatedPost?.authorId).toBe(targetUser.id);
	});

	it("should deny nested set in update when related post is outside allowed set", async () => {
		const role = `USER_${uuid()}`;
		const sourceUser = await adminClient.user.create({
			data: { email: `source-${uuid()}@example.com` },
		});
		const targetUser = await adminClient.user.create({
			data: { email: `target-${uuid()}@example.com` },
		});
		const allowedTitle = `set-allowed-${uuid()}`;
		const deniedTitle = `set-denied-${uuid()}`;
		const post = await adminClient.post.create({
			data: {
				title: deniedTitle,
				authorId: sourceUser.id,
			},
		});

		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				User: {
					updateSelf: {
						description: "Update self",
						operation: "UPDATE",
						expression: () => ({ id: targetUser.id }),
					},
				},
				Post: {
					updateAllowedPosts: {
						description: "Update posts in allowed title set",
						operation: "UPDATE",
						expression: (_client, _row, context) => ({
							title: { in: context("post.titles") as string[] },
						}),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [
					abilities.User.updateSelf,
					abilities.Post.updateAllowedPosts as any,
				],
			}),
			getContext: () => ({
				role,
				context: {
					"post.titles": [allowedTitle],
				},
			}),
		});

		await expect(
			client.user.update({
				where: { id: targetUser.id },
				data: {
					posts: {
						set: [{ id: post.id }],
					},
				},
			}),
		).rejects.toThrow("Record to update not found");

		const unchangedPost = await adminClient.post.findUnique({
			where: { id: post.id },
		});
		expect(unchangedPost?.authorId).toBe(sourceUser.id);
	});

	it("should allow nested disconnect in update when related post is allowed", async () => {
		const role = `USER_${uuid()}`;
		const targetUser = await adminClient.user.create({
			data: { email: `target-${uuid()}@example.com` },
		});
		const postTitle = `disconnect-allowed-${uuid()}`;
		const post = await adminClient.post.create({
			data: {
				title: postTitle,
				authorId: targetUser.id,
			},
		});

		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				User: {
					updateSelf: {
						description: "Update self",
						operation: "UPDATE",
						expression: () => ({ id: targetUser.id }),
					},
				},
				Post: {
					updateAllowedPosts: {
						description: "Update posts in allowed title set",
						operation: "UPDATE",
						expression: (_client, _row, context) => ({
							title: { in: context("post.titles") as string[] },
						}),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [
					abilities.User.updateSelf,
					abilities.Post.updateAllowedPosts as any,
				],
			}),
			getContext: () => ({
				role,
				context: {
					"post.titles": [postTitle],
				},
			}),
		});

		await expect(
			client.user.update({
				where: { id: targetUser.id },
				data: {
					posts: {
						disconnect: { id: post.id },
					},
				},
			}),
		).resolves.toBeDefined();

		const updatedPost = await adminClient.post.findUnique({
			where: { id: post.id },
		});
		expect(updatedPost?.authorId).toBeNull();
	});

	it("should deny nested disconnect in update when related post is outside allowed set", async () => {
		const role = `USER_${uuid()}`;
		const targetUser = await adminClient.user.create({
			data: { email: `target-${uuid()}@example.com` },
		});
		const allowedTitle = `disconnect-allowed-${uuid()}`;
		const deniedTitle = `disconnect-denied-${uuid()}`;
		const post = await adminClient.post.create({
			data: {
				title: deniedTitle,
				authorId: targetUser.id,
			},
		});

		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				User: {
					updateSelf: {
						description: "Update self",
						operation: "UPDATE",
						expression: () => ({ id: targetUser.id }),
					},
				},
				Post: {
					updateAllowedPosts: {
						description: "Update posts in allowed title set",
						operation: "UPDATE",
						expression: (_client, _row, context) => ({
							title: { in: context("post.titles") as string[] },
						}),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [
					abilities.User.updateSelf,
					abilities.Post.updateAllowedPosts as any,
				],
			}),
			getContext: () => ({
				role,
				context: {
					"post.titles": [allowedTitle],
				},
			}),
		});

		await expect(
			client.user.update({
				where: { id: targetUser.id },
				data: {
					posts: {
						disconnect: { id: post.id },
					},
				},
			}),
		).rejects.toThrow("Record to update not found");

		const unchangedPost = await adminClient.post.findUnique({
			where: { id: post.id },
		});
		expect(unchangedPost?.authorId).toBe(targetUser.id);
	});

	it("should deny relation filters when no FK or connect is provided", async () => {
		const role = `USER_${uuid()}`;
		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				Post: {
					createWithAuthorCheck: {
						description: "Create with author check",
						operation: "INSERT",
						expression: (_client, _row, context) => ({
							author: { id: context("user.id") as string },
						}),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [abilities.Post.createWithAuthorCheck as any],
			}),
			getContext: () => ({
				role,
				context: { "user.id": `user-${uuid()}` },
			}),
		});

		await expect(
			client.post.create({
				data: { title: `missing-author-${uuid()}` },
			}),
		).rejects.toThrow("Post.create");
	});

	it("should deny relation filters when nested create is used", async () => {
		const role = `USER_${uuid()}`;
		const email = `user-${uuid()}@example.com`;
		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				Post: {
					createWithAuthorEmail: {
						description: "Create with author email",
						operation: "INSERT",
						expression: (_client, _row, context) => ({
							author: { email: context("user.email") as string },
						}),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [abilities.Post.createWithAuthorEmail as any],
			}),
			getContext: () => ({
				role,
				context: { "user.email": email },
			}),
		});

		await expect(
			client.post.create({
				data: {
					title: `nested-author-${uuid()}`,
					author: { create: { email } },
				},
			}),
		).rejects.toThrow("Post.create");
	});

	it("should deny list relation filters when no connect/create is provided", async () => {
		const role = `USER_${uuid()}`;
		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				Post: {
					createWithTag: {
						description: "Create with tag",
						operation: "INSERT",
						expression: () => ({
							tags: { some: { label: "foo" } },
						}),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [abilities.Post.createWithTag as any],
			}),
			getContext: () => ({ role, context: {} }),
		});

		await expect(
			client.post.create({
				data: { title: `no-tags-${uuid()}` },
			}),
		).rejects.toThrow("Post.create");
	});

	it("should deny join relation filters when no join data is provided", async () => {
		const role = `USER_${uuid()}`;
		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				Organization: {
					createIfMember: {
						description: "Create org if member",
						operation: "INSERT",
						expression: (_client, _row, context) => ({
							roleAssignment: {
								some: { userId: context("user.id") as string },
							},
						}),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [abilities.Organization.createIfMember as any],
			}),
			getContext: () => ({
				role,
				context: { "user.id": `user-${uuid()}` },
			}),
		});

		await expect(
			client.organization.create({
				data: { name: `org-${uuid()}` },
			}),
		).rejects.toThrow("Organization.create");
	});

	it("should enforce allow/deny for supported Prisma operations", async () => {
		const allowRole = `ALLOW_${uuid()}`;
		const denyRole = `DENY_${uuid()}`;

		const postA = await adminClient.post.create({
			data: { title: `op-${uuid()}` },
		});
		const postB = await adminClient.post.create({
			data: { title: `op-${uuid()}` },
		});
		const deleteManyTitle = `op-delete-many-${uuid()}`;
		await adminClient.post.create({
			data: { title: deleteManyTitle },
		});

		const allowClient = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				Post: {
					readAll: {
						description: "Read all",
						operation: "SELECT",
						expression: () => ({}),
					},
					createPost: {
						description: "Create post",
						operation: "INSERT",
						expression: () => ({}),
					},
					updatePost: {
						description: "Update post",
						operation: "UPDATE",
						expression: () => ({ id: postA.id }),
					},
					deletePost: {
						description: "Delete post",
						operation: "DELETE",
						expression: () => ({ id: postA.id }),
					},
					deleteManyAllowed: {
						description: "Delete many",
						operation: "DELETE",
						expression: () => ({ title: deleteManyTitle }),
					},
				},
			},
			getRoles: (abilities) => ({
				[allowRole]: [
					abilities.Post.readAll as any,
					abilities.Post.createPost as any,
					abilities.Post.updatePost as any,
					abilities.Post.deletePost as any,
					abilities.Post.deleteManyAllowed as any,
				],
				[denyRole]: [],
			}),
			getContext: () => ({ role: allowRole, context: {} }),
		});

		const denyClient = await setup({
			prisma: new PrismaClient(),
			customAbilities: {},
			getRoles: () => ({
				[denyRole]: [],
			}),
			getContext: () => ({ role: denyRole, context: {} }),
		});

		await expect(
			allowClient.post.create({ data: { title: `create-${uuid()}` } }),
		).resolves.toBeDefined();
		await expect(
			denyClient.post.create({ data: { title: `create-${uuid()}` } }),
		).rejects.toThrow("Post.create");

		const createManyAllowed = await allowClient.post.createMany({
			data: [{ title: `bulk-${uuid()}` }, { title: `bulk-${uuid()}` }],
		});
		expect(createManyAllowed.count).toBe(2);
		await expect(
			denyClient.post.createMany({
				data: [{ title: `bulk-${uuid()}` }],
			}),
		).rejects.toThrow("Post.create");

		const findUnique = await allowClient.post.findUnique({
			where: { id: postA.id },
		});
		expect(findUnique?.id).toBe(postA.id);
		const findUniqueDenied = await denyClient.post.findUnique({
			where: { id: postA.id },
		});
		expect(findUniqueDenied).toBeNull();

		await expect(
			allowClient.post.findUniqueOrThrow({ where: { id: postA.id } }),
		).resolves.toBeDefined();
		await expect(
			denyClient.post.findUniqueOrThrow({ where: { id: postA.id } }),
		).rejects.toThrow();

		const findFirst = await allowClient.post.findFirst({
			where: { id: postA.id },
		});
		expect(findFirst?.id).toBe(postA.id);
		const findFirstDenied = await denyClient.post.findFirst({
			where: { id: postA.id },
		});
		expect(findFirstDenied).toBeNull();

		await expect(
			allowClient.post.findFirstOrThrow({ where: { id: postA.id } }),
		).resolves.toBeDefined();
		await expect(
			denyClient.post.findFirstOrThrow({ where: { id: postA.id } }),
		).rejects.toThrow();

		const findMany = await allowClient.post.findMany();
		expect(findMany.length).toBeGreaterThan(0);
		const findManyDenied = await denyClient.post.findMany();
		expect(findManyDenied.length).toBe(0);

		const countAllowed = await allowClient.post.count();
		expect(countAllowed).toBeGreaterThan(0);
		const countDenied = await denyClient.post.count();
		expect(countDenied).toBe(0);

		const aggregateAllowed = await allowClient.post.aggregate({
			_count: { _all: true },
		});
		expect(aggregateAllowed._count?._all ?? 0).toBeGreaterThan(0);
		const aggregateDenied = await denyClient.post.aggregate({
			_count: { _all: true },
		});
		expect(aggregateDenied._count?._all ?? 0).toBe(0);

		const groupAllowed = await allowClient.post.groupBy({
			by: ["published"],
			_count: { _all: true },
		});
		expect(groupAllowed.length).toBeGreaterThan(0);
		const groupDenied = await denyClient.post.groupBy({
			by: ["published"],
			_count: { _all: true },
		});
		expect(groupDenied.length).toBe(0);

		await expect(
			allowClient.post.update({
				where: { id: postA.id },
				data: { title: `updated-${uuid()}` },
			}),
		).resolves.toBeDefined();
		await expect(
			denyClient.post.update({
				where: { id: postA.id },
				data: { title: `updated-${uuid()}` },
			}),
		).rejects.toThrow("Record to update not found");

		const updateManyAllowed = await allowClient.post.updateMany({
			data: { published: true },
		});
		expect(updateManyAllowed.count).toBeGreaterThan(0);
		const updateManyDenied = await denyClient.post.updateMany({
			data: { published: true },
		});
		expect(updateManyDenied.count).toBe(0);

		await expect(
			allowClient.post.delete({ where: { id: postA.id } }),
		).resolves.toBeDefined();
		await expect(
			denyClient.post.delete({ where: { id: postB.id } }),
		).rejects.toThrow("Record to delete does not exist");

		const deleteManyAllowed = await allowClient.post.deleteMany({});
		expect(deleteManyAllowed.count).toBeGreaterThan(0);
		const deleteManyDenied = await denyClient.post.deleteMany({});
		expect(deleteManyDenied.count).toBe(0);

		const upsertCreate = await allowClient.post.upsert({
			where: { id: -1 },
			create: { title: `upsert-${uuid()}` },
			update: { title: `upsert-${uuid()}` },
		});
		expect(upsertCreate.id).toBeDefined();

		await expect(
			denyClient.post.upsert({
				where: { id: -2 },
				create: { title: `upsert-${uuid()}` },
				update: { title: `upsert-${uuid()}` },
			}),
		).rejects.toThrow("Post.create");
	});

	it("should apply permissions inside a prisma transaction", async () => {
		const role = `USER_${uuid()}`;
		const userId = `user-${uuid()}`;
		const otherId = `user-${uuid()}`;

		await adminClient.user.create({
			data: { id: userId, email: `user-${uuid()}@example.com` },
		});
		await adminClient.user.create({
			data: { id: otherId, email: `user-${uuid()}@example.com` },
		});

		await adminClient.post.create({
			data: { title: `own-${uuid()}`, authorId: userId },
		});
		await adminClient.post.create({
			data: { title: `other-${uuid()}`, authorId: otherId },
		});

		const client = await setup({
			prisma: new PrismaClient(),
			customAbilities: {
				Post: {
					readOwn: {
						description: "Read own posts",
						operation: "SELECT",
						expression: (_client, _row, context) => ({
							authorId: context("user.id") as string,
						}),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [abilities.Post.readOwn as any],
			}),
			getContext: () => ({
				role,
				context: { "user.id": userId },
			}),
		});

		const results = await client.$transaction(async (tx) => {
			return tx.post.findMany({
				orderBy: { id: "asc" },
			});
		});

		expect(results.length).toBe(1);
		expect(results[0].authorId).toBe(userId);
	});
});
