import { Yates } from "../../src";

type OperationQuery = (args: Record<string, never>) => Promise<unknown>;

type QueryExtension = (params: {
	__internalParams: { transaction: { kind: "itx" } };
	args: Record<string, never>;
	model: string;
	operation: string;
	query: OperationQuery;
}) => Promise<unknown>;

const createHarness = (context: Record<string, string> = {}) => {
	let allOperations: QueryExtension | undefined;
	const txClient = {
		$queryRaw: jest.fn().mockResolvedValue(undefined),
		$queryRawUnsafe: jest.fn().mockResolvedValue(undefined),
	};
	const prisma = {
		_createItxClient: jest.fn().mockReturnValue(txClient),
		$extends: jest.fn((extension: any) => {
			allOperations = extension.query.$allModels.$allOperations;
			return {};
		}),
	};
	const yates = new Yates(prisma as never);
	(yates as unknown as { databaseScope: string }).databaseScope = "test";

	yates.createClient(() => ({ role: "USER", context }));

	return {
		run: (query: OperationQuery) => {
			if (!allOperations) {
				throw new Error("Yates query extension was not registered");
			}

			return allOperations({
				__internalParams: { transaction: { kind: "itx" } },
				args: {},
				model: "Organization",
				operation: "create",
				query,
			});
		},
		txClient,
	};
};

describe("Prisma interactive transaction cleanup", () => {
	it("preserves the operation error when operation and cleanup both fail", async () => {
		const operationError = new Error("operation failed");
		const cleanupError = new Error("cleanup failed");
		const query = jest.fn().mockRejectedValue(operationError);
		const { run, txClient } = createHarness();
		txClient.$queryRawUnsafe
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(cleanupError);

		await expect(run(query)).rejects.toBe(operationError);
		expect(txClient.$queryRawUnsafe).toHaveBeenLastCalledWith("RESET ROLE");
	});

	it("preserves the operation error when cleanup succeeds", async () => {
		const operationError = new Error("operation failed");
		const query = jest.fn().mockRejectedValue(operationError);
		const { run, txClient } = createHarness();

		await expect(run(query)).rejects.toBe(operationError);
		expect(txClient.$queryRawUnsafe).toHaveBeenLastCalledWith("RESET ROLE");
	});

	it("returns the operation result and runs all cleanup when both succeed", async () => {
		const result = { id: "organization-id" };
		const query = jest.fn().mockResolvedValue(result);
		const { run, txClient } = createHarness({ "request.organization_id": "1" });

		await expect(run(query)).resolves.toBe(result);
		expect(txClient.$queryRaw).toHaveBeenCalledTimes(2);
		expect(txClient.$queryRawUnsafe).toHaveBeenNthCalledWith(
			1,
			expect.stringContaining("SET LOCAL ROLE"),
		);
		expect(txClient.$queryRawUnsafe).toHaveBeenNthCalledWith(2, "RESET ROLE");
	});

	it("reports the cleanup error when the operation succeeds", async () => {
		const cleanupError = new Error("cleanup failed");
		const query = jest.fn().mockResolvedValue({ id: "organization-id" });
		const { run, txClient } = createHarness();
		txClient.$queryRawUnsafe
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(cleanupError);

		await expect(run(query)).rejects.toBe(cleanupError);
	});
});
