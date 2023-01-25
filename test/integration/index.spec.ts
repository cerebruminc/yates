import { PrismaClient } from "@prisma/client";
import { v4 as uuid } from "uuid";
import { setup } from "../../src";

describe("setup", () => {
	describe("params.getRoles()", () => {
		it("should provide a set of built-in abilities for CRUD operations", async () => {
			const prisma = new PrismaClient();

			const getRoles = jest.fn((_abilities) => {
				return {
					USER: "*",
				} as any;
			});

			await setup({
				prisma,
				getRoles,
				getContext: () => null,
			});

			expect(getRoles.mock.calls).toHaveLength(1);
			const abilities = getRoles.mock.calls[0][0];

			expect(Object.keys(abilities)).toStrictEqual(["User", "Post", "Tag"]);
			expect(Object.keys(abilities.User)).toStrictEqual(["create", "read", "update", "delete"]);
			expect(Object.keys(abilities.Post)).toStrictEqual(["create", "read", "update", "delete"]);
			expect(Object.keys(abilities.Tag)).toStrictEqual(["create", "read", "update", "delete"]);
		});
	});

	describe("params.getContext()", () => {
		it("should skip RBAC if .getContext() returns null", async () => {
			const prisma = new PrismaClient();

			const role = `USER_${uuid()}`;

			await setup({
				prisma,
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.read],
					};
				},
				getContext: () => {
					return null;
				},
			});

			const post = await prisma.post.create({
				data: {
					title: "Test post",
				},
			});

			expect(post.id).toBeDefined();
		});

		it("should allow a custom context to be set", async () => {
			const prisma = new PrismaClient();

			const role = `USER_${uuid()}`;

			const postTitle = `Test post from ${role}`;

			await setup({
				prisma,
				customAbilities: {
					Post: {
						createWithTitle: {
							description: "Test Post Create",
							operation: "INSERT",
							expression: "current_setting('post.title') = title",
						},
						readWithTitle: {
							description: "Test Post Read",
							operation: "SELECT",
							expression: "current_setting('post.title') = title",
						},
					},
				},
				getRoles(abilities) {
					return {
						[role]: [abilities.Post.createWithTitle, abilities.Post.readWithTitle],
					};
				},
				getContext: () => {
					return {
						role,
						context: {
							"post.title": postTitle,
						},
					};
				},
			});

			const post = await prisma.post.create({
				data: {
					title: postTitle,
				},
			});

			expect(post.id).toBeDefined();
		});
	});
});
