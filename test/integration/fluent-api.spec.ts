import { PrismaClient } from "@prisma/client";
import { v4 as uuid } from "uuid";
import { setup } from "../../src";

let client: PrismaClient;

beforeAll(async () => {
	client = (await setup({
		prisma: new PrismaClient(),
		getRoles: () => ({
			USER: "*",
		}),
		getContext: () => ({
			role: "USER",
		}),
	})) as PrismaClient;
});

// Tests that cover the Prisma Fluent API functionality, which allow you to traverse relationships
// These queries have a slightly different internal structure than the usual Prisma Client API, so it's a good idea to test them.
// See https://www.prisma.io/docs/concepts/components/prisma-client/relation-queries#fluent-api
describe("Fluent API", () => {
	it("should allow you to traverse 1-to-many relationships", async () => {
		const title = `test title: ${uuid()}`;
		const user = await client.user.create({
			data: {
				name: "test",
				email: `test_${uuid()}@test.com`,
				posts: {
					create: {
						title,
					},
				},
			},
		});

		const result = await client.user
			.findUnique({
				where: {
					id: user.id,
				},
			})
			.posts();

		expect(result).toHaveLength(1);
		expect(result![0].title).toBe(title);
	});

	it("should allow you to traverse 1-to-1 relationships", async () => {
		const user = await client.user.create({
			data: {
				name: "test",
				email: `test_${uuid()}@test.com`,
				hat: {
					create: {
						style: "baseball",
					},
				},
			},
		});
		const result = await client.user
			.findUnique({
				where: {
					id: user.id,
				},
			})
			.hat();

		expect(result).not.toBeNull();
		expect(result!.style).toBe("baseball");
	});

	it("should allow you to traverse many-to-many relationships", async () => {
		const title = `test title: ${uuid()}`;
		const label = `test_${uuid()}`;
		const post = await client.post.create({
			data: {
				title,
				tags: {
					create: {
						label,
					},
				},
			},
		});
		const result = await client.post
			.findUnique({
				where: {
					id: post.id,
				},
			})
			.tags();

		expect(result).not.toBeNull();
		expect(result).toHaveLength(1);
		expect(result![0].label).toBe(label);
	});
});
