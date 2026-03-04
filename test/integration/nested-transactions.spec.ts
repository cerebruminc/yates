import { PrismaClient } from "@prisma/client";
import { v4 as uuid } from "uuid";
import { setup } from "../../src";

// This function is setup to demonstrate the behaviour of nested transactions and rollbacks in Prisma.
// This example is based on interactive transaction docs on the Prisma website:
// https://www.prisma.io/docs/concepts/components/prisma-client/transactions#interactive-transactions
async function transfer(
	client: PrismaClient,
	from: string,
	to: string,
	amount: number,
) {
	return await client.$transaction(async (tx) => {
		// 1. Decrement amount from the sender.
		const sender = await tx.account.update({
			data: {
				balance: {
					decrement: amount,
				},
			},
			where: {
				email: from,
			},
		});

		// 2. Verify that the sender's balance didn't go below zero.
		if (sender.balance < 0) {
			throw new Error(`${from} doesn't have enough to send ${amount}`);
		}

		// 3. Increment the recipient's balance by amount
		const recipient = await tx.account.update({
			data: {
				balance: {
					increment: amount,
				},
			},
			where: {
				email: to,
			},
		});

		return recipient;
	});
}

describe("nested transactions", () => {
	it("is expected to NOT rollback transactions if the outer transaction fails", async () => {
		const role = `USER_${uuid()}`;
		const client = await setup({
			prisma: new PrismaClient(),
			getRoles(_abilities) {
				return {
					[role]: "*",
				};
			},
			getContext: () => ({
				role,
				context: {},
			}),
		});

		const email1 = `alice-${uuid()}@example.com`;
		const account1 = await client.account.create({
			data: {
				email: email1,
				balance: 100,
			},
		});
		const email2 = `bob-${uuid()}@example.com`;
		const account2 = await client.account.create({
			data: {
				email: email2,
				balance: 100,
			},
		});

		// This transfer is successful
		await transfer(client as PrismaClient, email1, email2, 100);
		// This transfer fails because Alice doesn't have enough funds in her account
		await expect(
			transfer(client as PrismaClient, email1, email2, 100),
		).rejects.toThrow();

		// Due to lack of nested transaction support, the first transfer is not rolled back
		// and the "from" account is still debited
		const result1 = await client.account.findUniqueOrThrow({
			where: {
				id: account1.id,
			},
		});

		expect(result1.balance).toBe(-100);

		const result2 = await client.account.findUniqueOrThrow({
			where: {
				id: account2.id,
			},
		});

		expect(result2.balance).toBe(200);
	});

	it("should rollback transactions if the outer transaction fails if you bypass yates", async () => {
		const role = `USER_${uuid()}`;
		const client = await setup({
			prisma: new PrismaClient(),
			getRoles(_abilities) {
				return {
					[role]: "*",
				};
			},
			// Returning null here bypasses yates
			getContext: () => null,
		});

		const email1 = `alice-${uuid()}@example.com`;
		const account1 = await client.account.create({
			data: {
				email: email1,
				balance: 100,
			},
		});
		const email2 = `bob-${uuid()}@example.com`;
		const account2 = await client.account.create({
			data: {
				email: email2,
				balance: 100,
			},
		});

		// This transfer is successful
		await transfer(client as PrismaClient, email1, email2, 100);
		// This transfer fails because Alice doesn't have enough funds in her account
		await expect(
			transfer(client as PrismaClient, email1, email2, 100),
		).rejects.toThrow();

		// Because we bypassed the Yates internal transaction, the rollback is successful
		// and the "from" account is never debited.
		const result1 = await client.account.findUniqueOrThrow({
			where: {
				id: account1.id,
			},
		});

		expect(result1.balance).toBe(0);

		const result2 = await client.account.findUniqueOrThrow({
			where: {
				id: account2.id,
			},
		});

		expect(result2.balance).toBe(200);
	});
});
