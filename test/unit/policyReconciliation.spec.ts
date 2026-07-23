import { Yates } from "../../src";

describe("policy reconciliation", () => {
	it("recreates a missing policy when its Yates ability metadata still exists", async () => {
		const prisma = {
			$queryRaw: jest
				.fn()
				.mockResolvedValueOnce([
					{
						ability_model: "Post",
						ability_policy_name: "post_read",
						ability_expression: "true",
					},
				])
				.mockResolvedValueOnce([]),
			$queryRawUnsafe: jest.fn().mockResolvedValue([]),
			$executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
		};
		const yates = new Yates(prisma as never);

		await yates.setRLS(
			prisma as never,
			"Post",
			"post_read",
			"read",
			{
				description: "Read posts",
				expression: "true",
				operation: "SELECT",
			},
			{
				abilityExpression: "true",
				policyExpression: "true",
			},
		);

		expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
			expect.stringContaining('CREATE POLICY "post_read" ON "public"."Post"'),
		);
	});

	it("reconciles when an expected policy is missing despite a current manifest", async () => {
		const prisma: {
			$executeRawUnsafe: jest.Mock;
			$queryRawUnsafe: jest.Mock;
			$transaction: jest.Mock;
		} = {
			$executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
			$queryRawUnsafe: jest
				.fn()
				.mockResolvedValueOnce([{ manifest_hash: "current-hash" }])
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([{ manifest_hash: "current-hash" }])
				.mockResolvedValueOnce([]),
			$transaction: jest.fn(),
		};
		prisma.$transaction.mockImplementation((callback) => callback(prisma));
		const yates = new Yates(prisma as never);
		(yates as unknown as { databaseScope: string }).databaseScope = "test";
		jest.spyOn(yates, "prepareSetup").mockResolvedValue({
			abilities: {
				Post: {
					read: { expression: "true", operation: "SELECT" },
				},
			},
			defaultAbilities: {},
			roles: { ADMIN: [] },
			setupManifest: {
				abilities: [
					{
						expression: "true",
						model: "Post",
						operation: "SELECT",
						policyName: "post_read",
						slug: "read",
					},
				],
				databaseScope: "test",
				roles: [{ grants: [], roleName: "admin" }],
			},
			setupManifestHash: "current-hash",
			setupManifestId: "test:public",
		} as never);
		jest.spyOn(yates, "resolveSetupAbilityExpressions").mockResolvedValue({});
		const reconcileRoles = jest
			.spyOn(yates, "reconcileRoles")
			.mockResolvedValue(undefined);
		jest.spyOn(yates, "upsertSetupManifestHash").mockResolvedValue(1);

		await yates.createRoles({ getRoles: () => ({}) });

		expect(reconcileRoles).toHaveBeenCalledTimes(1);
	});
});
