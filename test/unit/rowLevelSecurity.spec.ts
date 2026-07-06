import { Yates } from "../../src";

const createPrismaMock = (rowLevelSecurityEnabled: boolean) => ({
	$queryRawUnsafe: jest
		.fn()
		.mockResolvedValue([{ relrowsecurity: rowLevelSecurityEnabled }]),
	$executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
});

describe("row level security setup", () => {
	it("skips ALTER TABLE when row level security is already enabled", async () => {
		const prisma = createPrismaMock(true);
		const yates = new Yates(prisma as never);

		await yates.enableRowLevelSecurityIfNeeded(prisma as never, "Post");

		expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
			expect.stringContaining("relrowsecurity") as unknown as string,
			"Post",
		);
		expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
	});

	it("runs ALTER TABLE when row level security is not enabled", async () => {
		const prisma = createPrismaMock(false);
		const yates = new Yates(prisma as never);

		await yates.enableRowLevelSecurityIfNeeded(prisma as never, "Post");

		expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
			'ALTER table "public"."Post" enable row level security;',
		);
	});
});
