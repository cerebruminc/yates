import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { PrismaClient as SecondaryPrismaClient } from "../../prisma/secondary/generated/client";
import { createPrismaClient as createPrimaryPrismaClient } from "../../src/prisma-client";

type DisconnectableClient = {
	$disconnect: () => Promise<void>;
};

const managedClients = new Set<DisconnectableClient>();

const registerClient = <T extends DisconnectableClient>(client: T): T => {
	managedClients.add(client);
	return client;
};

export const createPrismaClient = (
	...args: Parameters<typeof createPrimaryPrismaClient>
): PrismaClient => {
	const client = createPrimaryPrismaClient(...args);
	return registerClient(client);
};

export const createSecondaryPrismaClient = (
	connectionString = process.env.DATABASE_URL_2,
): SecondaryPrismaClient => {
	if (!connectionString) {
		throw new Error("DATABASE_URL_2 is required to create a PrismaClient");
	}

	return registerClient(
		new SecondaryPrismaClient({
			adapter: new PrismaPg({
				connectionString,
				allowExitOnIdle: true,
			}),
		}),
	);
};

if (typeof afterEach === "function") {
	afterEach(async () => {
		const clients = Array.from(managedClients);
		managedClients.clear();
		await Promise.all(
			clients.map((client) => client.$disconnect().catch(() => {})),
		);
	});
}
