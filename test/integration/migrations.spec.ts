import { PrismaClient, User } from "@prisma/client";
import { v4 as uuid } from "uuid";
import { Yates, migrateYates, setup } from "../../src";

let adminClient: PrismaClient;

beforeAll(async () => {
	adminClient = new PrismaClient();
});

describe("migrations", () => {
	it("recreates a dropped policy when its manifest and Yates metadata are unchanged", async () => {
		const prisma = new PrismaClient();
		const abilitySlug = `reconcile_${uuid().replace(/-/g, "")}`;
		const role = `USER_${uuid()}`;
		const customAbilities = {
			Post: {
				[abilitySlug]: {
					description: "Regression-test policy reconciliation",
					expression: "true",
					operation: "SELECT" as const,
				},
			},
		};
		const getRoles = (abilities: any) => ({
			[role]: [abilities.Post[abilitySlug]],
		});

		await migrateYates({
			prisma,
			customAbilities: customAbilities as never,
			getRoles: getRoles as never,
		});

		const yates = new Yates(prisma);
		await yates.ensureDatabaseScope();
		const policyName = yates.createAbilityName("Post", abilitySlug);
		await prisma.$executeRawUnsafe(
			`DROP POLICY ${yates.quoteIdentifier(policyName)} ON "public"."Post";`,
		);

		await migrateYates({
			prisma,
			customAbilities: customAbilities as never,
			getRoles: getRoles as never,
		});

		const policies = await prisma.$queryRawUnsafe<{ policyname: string }[]>(
			`SELECT policyname FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'Post' AND policyname = $1`,
			policyName,
		);
		expect(policies).toEqual([{ policyname: policyName }]);
	});

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
					readWithTitle_fa0xC: {
						description: "Read posts with a special title",
						operation: "SELECT",
						expression: "title = 'Special title'",
					},
				},
			},
			getRoles(abilities) {
				return {
					[role]: [abilities.Post.readWithTitle_fa0xC],
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
