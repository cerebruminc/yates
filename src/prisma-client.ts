import { PrismaPg } from "@prisma/adapter-pg";
import type { Prisma, PrismaClient } from "@prisma/client";

type PrismaClientBaseOptions = Omit<
	Prisma.PrismaClientOptions,
	"adapter" | "accelerateUrl"
>;

export const createPrismaClient = (
	options: PrismaClientBaseOptions = {},
	connectionString = process.env.DATABASE_URL,
): PrismaClient => {
	if (!connectionString) {
		throw new Error("DATABASE_URL is required to create a PrismaClient");
	}

	const { PrismaClient: PrismaClientConstructor } =
		require("@prisma/client") as {
			PrismaClient: new (options: Prisma.PrismaClientOptions) => PrismaClient;
		};

	return new PrismaClientConstructor({
		...options,
		adapter: new PrismaPg({
			connectionString,
			allowExitOnIdle: true,
		}),
	});
};
