import { Yates } from "../../src";

const YATES_VERSION = require("../../package.json").version as string;

describe("setup manifest", () => {
	it("creates the same manifest hash when role and ability order changes", () => {
		const yates = new Yates({} as never);

		const firstHash = yates.createSetupManifestHash({
			abilities: [
				{
					expression: "true",
					model: "Post",
					operation: "SELECT",
					policyName: "post_read",
					slug: "read",
				},
				{
					expression: "true",
					model: "User",
					operation: "SELECT",
					policyName: "user_read",
					slug: "read",
				},
			],
			databaseScope: "test",
			roles: [
				{ roleName: "admin", grants: ["user_read", "post_read"] },
				{ roleName: "processor", grants: ["post_read"] },
			],
		});

		const secondHash = yates.createSetupManifestHash({
			abilities: [
				{
					expression: "true",
					model: "User",
					operation: "SELECT",
					policyName: "user_read",
					slug: "read",
				},
				{
					expression: "true",
					model: "Post",
					operation: "SELECT",
					policyName: "post_read",
					slug: "read",
				},
			],
			databaseScope: "test",
			roles: [
				{ roleName: "processor", grants: ["post_read"] },
				{ roleName: "admin", grants: ["post_read", "user_read"] },
			],
		});

		expect(secondHash).toBe(firstHash);
	});

	it("changes the manifest hash when a policy expression changes", () => {
		const yates = new Yates({} as never);

		const firstHash = yates.createSetupManifestHash({
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
			roles: [{ roleName: "admin", grants: ["post_read"] }],
		});

		const secondHash = yates.createSetupManifestHash({
			abilities: [
				{
					expression: "organization_id = current_setting('context.org_id')",
					model: "Post",
					operation: "SELECT",
					policyName: "post_read",
					slug: "read",
				},
			],
			databaseScope: "test",
			roles: [{ roleName: "admin", grants: ["post_read"] }],
		});

		expect(secondHash).not.toBe(firstHash);
	});

	it("skips role reconciliation when the stored manifest hash is current", async () => {
		const prisma = {
			$queryRawUnsafe: jest
				.fn()
				.mockResolvedValue([{ manifest_hash: "current-hash" }]),
		};
		const yates = new Yates(prisma as never);
		(yates as unknown as { databaseScope: string }).databaseScope = "test";
		jest
			.spyOn(yates, "createSetupManifestHash")
			.mockReturnValue("current-hash");
		jest.spyOn(yates, "inspectRunTimeDataModel").mockReturnValue({
			models: { Post: {} },
		} as never);

		await yates.createRoles({
			getRoles: (abilities) => ({
				ADMIN: [abilities.Post.read],
			}),
		});

		expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
		expect(prisma.$queryRawUnsafe.mock.calls[0][0]).toContain(
			"_yates_schema_syncs",
		);
	});

	it("stores separate setup manifest and Yates package versions", async () => {
		const prisma = {
			$executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
		};
		const yates = new Yates(prisma as never);

		await yates.upsertSetupManifestHash(
			"test:public",
			"manifest-hash",
			prisma as never,
		);

		expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain(
			"manifest_version",
		);
		expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain(
			"yates_version",
		);
		expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain("app_version");
		expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain("app_revision");
		expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
			expect.any(String),
			"test:public",
			"manifest-hash",
			"1",
			YATES_VERSION,
			"yates",
			null,
			null,
		);
	});

	it("rechecks the manifest after acquiring the setup lock", async () => {
		const prisma: {
			$executeRawUnsafe: jest.Mock;
			$queryRawUnsafe: jest.Mock;
			$transaction: jest.Mock;
		} = {
			$executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
			$queryRawUnsafe: jest
				.fn()
				.mockResolvedValueOnce([{ manifest_hash: "old-hash" }])
				.mockResolvedValueOnce([{ manifest_hash: "current-hash" }]),
			$transaction: jest.fn((callback) => callback(prisma)),
		};
		const yates = new Yates(prisma as never);
		(yates as unknown as { databaseScope: string }).databaseScope = "test";
		jest
			.spyOn(yates, "createSetupManifestHash")
			.mockReturnValue("current-hash");
		jest.spyOn(yates, "inspectRunTimeDataModel").mockReturnValue({
			models: { Post: {} },
		} as never);

		await yates.createRoles({
			getRoles: (abilities) => ({
				ADMIN: [abilities.Post.read],
			}),
		});

		expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
		expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
			"SELECT pg_advisory_xact_lock(2142616474639426746);",
		);
		expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
			maxWait: 30000,
			timeout: 30000,
		});
	});

	it("validates setup without mutating database state", async () => {
		const prisma = {
			$queryRawUnsafe: jest
				.fn()
				.mockResolvedValue([{ manifest_hash: "current-hash" }]),
			$executeRawUnsafe: jest.fn(),
		};
		const yates = new Yates(prisma as never);
		(yates as unknown as { databaseScope: string }).databaseScope = "test";
		jest
			.spyOn(yates, "createSetupManifestHash")
			.mockReturnValue("current-hash");
		jest.spyOn(yates, "inspectRunTimeDataModel").mockReturnValue({
			models: { Post: {} },
		} as never);

		await expect(
			yates.validateSetup({
				getRoles: (abilities) => ({
					ADMIN: [abilities.Post.read],
				}),
			}),
		).resolves.toEqual({
			actualHash: "current-hash",
			expectedHash: "current-hash",
			manifestId: "test:public",
		});

		expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
	});

	it("fails validation with a migration error when the schema sync table is missing", async () => {
		const prisma = {
			$queryRawUnsafe: jest.fn().mockRejectedValue({ code: "42P01" }),
			$executeRawUnsafe: jest.fn(),
		};
		const yates = new Yates(prisma as never);
		(yates as unknown as { databaseScope: string }).databaseScope = "test";
		jest
			.spyOn(yates, "createSetupManifestHash")
			.mockReturnValue("current-hash");
		jest.spyOn(yates, "inspectRunTimeDataModel").mockReturnValue({
			models: { Post: {} },
		} as never);

		await expect(
			yates.validateSetup({
				getRoles: (abilities) => ({
					ADMIN: [abilities.Post.read],
				}),
			}),
		).rejects.toThrow("Run the explicit Yates migration");

		expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
	});
});
