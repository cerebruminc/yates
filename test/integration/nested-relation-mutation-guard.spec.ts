import { PrismaClient } from "@prisma/client";
import { v4 as uuid } from "uuid";
import { setup } from "../../src";

let adminClient: PrismaClient;

beforeAll(async () => {
	adminClient = new PrismaClient();
});

afterAll(async () => {
	await adminClient.$disconnect();
});

const createUpdateClient = async (
	role: string,
	postId: number,
	nestedRelationMutationGuard?: Parameters<
		typeof setup
	>[0]["nestedRelationMutationGuard"],
) =>
	setup({
		prisma: new PrismaClient(),
		customAbilities: {
			Post: {
				updateOne: {
					description: "Update a single post",
					operation: "UPDATE",
					expression: () => ({ id: postId }),
				},
			},
		},
		getRoles: (abilities) => ({
			[role]: [abilities.Post.updateOne as any],
		}),
		getContext: () => ({ role, context: {} }),
		nestedRelationMutationGuard,
	});

describe("nested relation mutation guard", () => {
	it("blocks implicit many-to-many nested connect when enabled", async () => {
		const role = `USER_${uuid()}`;
		const post = await adminClient.post.create({
			data: { title: `post-${uuid()}` },
		});
		const tag = await adminClient.tag.create({
			data: { label: `tag-${uuid()}` },
		});

		const client = await createUpdateClient(role, post.id, { enabled: true });

		await expect(
			client.post.update({
				where: { id: post.id },
				data: {
					tags: {
						connect: { id: tag.id },
					},
				},
			}),
		).rejects.toThrow("Nested relation mutation denied by Yates policy");

		const persisted = await adminClient.post.findUnique({
			where: { id: post.id },
			include: { tags: true },
		});

		expect(persisted?.tags).toHaveLength(0);
	});

	it("allows normal scalar updates when guard is enabled", async () => {
		const role = `USER_${uuid()}`;
		const post = await adminClient.post.create({
			data: { title: `post-${uuid()}` },
		});
		const nextTitle = `updated-${uuid()}`;

		const client = await createUpdateClient(role, post.id, { enabled: true });

		const updated = await client.post.update({
			where: { id: post.id },
			data: { title: nextTitle },
		});

		expect(updated.title).toBe(nextTitle);
	});

	it("keeps existing nested relation mutation behavior when option is disabled", async () => {
		const role = `USER_${uuid()}`;
		const post = await adminClient.post.create({
			data: { title: `post-${uuid()}` },
		});
		const tag = await adminClient.tag.create({
			data: { label: `tag-${uuid()}` },
		});

		const client = await createUpdateClient(role, post.id);

		await expect(
			client.post.update({
				where: { id: post.id },
				data: {
					tags: {
						connect: { id: tag.id },
					},
				},
			}),
		).resolves.toBeDefined();

		const persisted = await adminClient.post.findUnique({
			where: { id: post.id },
			include: { tags: true },
		});

		expect(persisted?.tags).toHaveLength(1);
		expect(persisted?.tags[0]?.id).toBe(tag.id);
	});
});
