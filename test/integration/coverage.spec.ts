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
});
