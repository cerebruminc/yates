import { PrismaClient } from "@prisma/client";
import { PrismaClient as PrismaClient2 } from "../../prisma/secondary/generated/client";
import { Yates, setup } from "../../src";

describe("Multi-tenant database tests", () => {
	it("should not overwrite data between tenants", async () => {
		const rootClient1 = new PrismaClient();
		const rootClient2 = new PrismaClient2();

		const role = "ADMIN";

		const _client1 = await setup({
			prisma: rootClient1,
			getRoles(_abilities) {
				return {
					[role]: "*",
				};
			},
			getContext: () => ({
				role,
			}),
		});

		const yates1 = new Yates(rootClient1);
		const roles1 = await yates1.inspectDBRoles(role);
		const models1 = Object.keys(yates1.inspectRunTimeDataModel().models);
		// Expect to see 4 roles (CRUD) for each defined model when using wildcard abilities (*)
		expect(roles1.length).toBe(models1.length * 4);

		const _client2 = await setup({
			prisma: rootClient2 as PrismaClient,
			getRoles(abilities) {
				return {
					[role]: [abilities.User.create, abilities.User.read],
				};
			},
			getContext: () => ({
				role,
			}),
		});

		const yates2 = new Yates(rootClient2 as PrismaClient);
		const roles2 = await yates2.inspectDBRoles(role);
		// Expect to see 2 roles (CREATE, READ) for User model only
		expect(roles2.length).toBe(2);

		// The setup of client2 should not have affected client1
		const rolesAfterSetup = await yates1.inspectDBRoles(role);
		// Expect to see 4 roles (CRUD) for each defined model when using wildcard abilities (*)
		expect(rolesAfterSetup.length).toBe(models1.length * 4);
	});
});
