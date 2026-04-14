import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import "dotenv/config";

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

	return new PrismaClient({
		...options,
		adapter: new PrismaPg({
			connectionString,
			allowExitOnIdle: true,
		}),
	});
};
