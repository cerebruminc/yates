import { PrismaClient } from "@prisma/client";
import { v4 as uuid } from "uuid";
import { setup } from "../../src";
import { createPrismaClient } from "../helpers/prisma-client";

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
	it("should rollback transactions if the outer transaction fails with Yates enabled", async () => {
		const role = `USER_${uuid()}`;
		const client = await setup({
			prisma: createPrismaClient(),
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

		// With nested transaction support, the failed transfer is rolled back.
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

	it("should support nested interactive transactions with Yates", async () => {
		const role = `USER_${uuid()}`;
		const client = await setup({
			prisma: createPrismaClient(),
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
		const email2 = `bob-${uuid()}@example.com`;

		const account1 = await client.account.create({
			data: {
				email: email1,
				balance: 100,
			},
		});
		const account2 = await client.account.create({
			data: {
				email: email2,
				balance: 100,
			},
		});

		await client.$transaction(async (outerTx) => {
			await outerTx.$transaction(async (innerTx) => {
				await innerTx.account.update({
					where: { id: account1.id },
					data: { balance: { decrement: 50 } },
				});
				await innerTx.account.update({
					where: { id: account2.id },
					data: { balance: { increment: 50 } },
				});
			});
		});

		const afterCommit1 = await client.account.findUniqueOrThrow({
			where: { id: account1.id },
		});
		const afterCommit2 = await client.account.findUniqueOrThrow({
			where: { id: account2.id },
		});
		expect(afterCommit1.balance).toBe(50);
		expect(afterCommit2.balance).toBe(150);

		await expect(
			client.$transaction(async (outerTx) => {
				await outerTx.$transaction(async (innerTx) => {
					await innerTx.account.update({
						where: { id: account1.id },
						data: { balance: { decrement: 25 } },
					});
					await innerTx.account.update({
						where: { id: account2.id },
						data: { balance: { increment: 25 } },
					});
				});

				throw new Error("force outer rollback");
			}),
		).rejects.toThrow("force outer rollback");

		const afterRollback1 = await client.account.findUniqueOrThrow({
			where: { id: account1.id },
		});
		const afterRollback2 = await client.account.findUniqueOrThrow({
			where: { id: account2.id },
		});
		expect(afterRollback1.balance).toBe(50);
		expect(afterRollback2.balance).toBe(150);
	});

	it("should allow a nested rollback to be caught while outer transaction continues with Yates", async () => {
		const role = `USER_${uuid()}`;
		const client = await setup({
			prisma: createPrismaClient(),
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

		const a1 = await client.account.create({
			data: {
				email: `a1-${uuid()}@example.com`,
				balance: 100,
			},
		});
		const a2 = await client.account.create({
			data: {
				email: `a2-${uuid()}@example.com`,
				balance: 100,
			},
		});
		const a3 = await client.account.create({
			data: {
				email: `a3-${uuid()}@example.com`,
				balance: 100,
			},
		});

		await client.$transaction(async (outerTx) => {
			await outerTx.account.update({
				where: { id: a1.id },
				data: { balance: { decrement: 10 } },
			});

			try {
				await outerTx.$transaction(async (innerTx) => {
					await innerTx.account.update({
						where: { id: a2.id },
						data: { balance: { increment: 10 } },
					});
					throw new Error("inner rollback");
				});
			} catch (e) {
				expect((e as Error).message).toBe("inner rollback");
			}

			await outerTx.account.update({
				where: { id: a3.id },
				data: { balance: { increment: 10 } },
			});
		});

		const r1 = await client.account.findUniqueOrThrow({ where: { id: a1.id } });
		const r2 = await client.account.findUniqueOrThrow({ where: { id: a2.id } });
		const r3 = await client.account.findUniqueOrThrow({ where: { id: a3.id } });

		expect(r1.balance).toBe(90);
		expect(r2.balance).toBe(100);
		expect(r3.balance).toBe(110);
	});

	it("should support deep nesting (3 levels) with Yates", async () => {
		const role = `USER_${uuid()}`;
		const client = await setup({
			prisma: createPrismaClient(),
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

		const a1 = await client.account.create({
			data: {
				email: `d1-${uuid()}@example.com`,
				balance: 100,
			},
		});
		const a2 = await client.account.create({
			data: {
				email: `d2-${uuid()}@example.com`,
				balance: 100,
			},
		});
		const a3 = await client.account.create({
			data: {
				email: `d3-${uuid()}@example.com`,
				balance: 100,
			},
		});

		await client.$transaction(async (tx) => {
			await tx.account.update({
				where: { id: a1.id },
				data: { balance: { decrement: 10 } },
			});

			await tx.$transaction(async (tx2) => {
				await tx2.account.update({
					where: { id: a2.id },
					data: { balance: { increment: 10 } },
				});

				await tx2.$transaction(async (tx3) => {
					await tx3.account.update({
						where: { id: a2.id },
						data: { balance: { decrement: 5 } },
					});
					await tx3.account.update({
						where: { id: a3.id },
						data: { balance: { increment: 5 } },
					});
				});
			});
		});

		const r1 = await client.account.findUniqueOrThrow({ where: { id: a1.id } });
		const r2 = await client.account.findUniqueOrThrow({ where: { id: a2.id } });
		const r3 = await client.account.findUniqueOrThrow({ where: { id: a3.id } });

		expect(r1.balance).toBe(90);
		expect(r2.balance).toBe(105);
		expect(r3.balance).toBe(105);
	});

	it("should support sequential nested transactions with Yates", async () => {
		const role = `USER_${uuid()}`;
		const client = await setup({
			prisma: createPrismaClient(),
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

		const a1 = await client.account.create({
			data: {
				email: `s1-${uuid()}@example.com`,
				balance: 100,
			},
		});
		const a2 = await client.account.create({
			data: {
				email: `s2-${uuid()}@example.com`,
				balance: 100,
			},
		});
		const a3 = await client.account.create({
			data: {
				email: `s3-${uuid()}@example.com`,
				balance: 100,
			},
		});

		await client.$transaction(async (tx) => {
			await tx.$transaction(async (tx2) => {
				await tx2.account.update({
					where: { id: a1.id },
					data: { balance: { decrement: 5 } },
				});
				await tx2.account.update({
					where: { id: a2.id },
					data: { balance: { increment: 5 } },
				});
			});

			await tx.$transaction(async (tx3) => {
				await tx3.account.update({
					where: { id: a2.id },
					data: { balance: { decrement: 5 } },
				});
				await tx3.account.update({
					where: { id: a3.id },
					data: { balance: { increment: 5 } },
				});
			});
		});

		const r1 = await client.account.findUniqueOrThrow({ where: { id: a1.id } });
		const r2 = await client.account.findUniqueOrThrow({ where: { id: a2.id } });
		const r3 = await client.account.findUniqueOrThrow({ where: { id: a3.id } });

		expect(r1.balance).toBe(95);
		expect(r2.balance).toBe(100);
		expect(r3.balance).toBe(105);
	});

	it("should keep outer transaction open after nested commit with Yates", async () => {
		const role = `USER_${uuid()}`;
		const client = await setup({
			prisma: createPrismaClient(),
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

		const a1 = await client.account.create({
			data: {
				email: `o1-${uuid()}@example.com`,
				balance: 100,
			},
		});
		const a2 = await client.account.create({
			data: {
				email: `o2-${uuid()}@example.com`,
				balance: 100,
			},
		});
		const a3 = await client.account.create({
			data: {
				email: `o3-${uuid()}@example.com`,
				balance: 100,
			},
		});

		await client.$transaction(async (tx) => {
			await tx.account.update({
				where: { id: a1.id },
				data: { balance: { decrement: 10 } },
			});

			await tx.$transaction(async (tx2) => {
				await tx2.account.update({
					where: { id: a2.id },
					data: { balance: { increment: 10 } },
				});
			});

			// If nested commit closes outer tx incorrectly, this query/update should fail.
			await tx.account.update({
				where: { id: a3.id },
				data: { balance: { increment: 10 } },
			});
		});

		const r1 = await client.account.findUniqueOrThrow({ where: { id: a1.id } });
		const r2 = await client.account.findUniqueOrThrow({ where: { id: a2.id } });
		const r3 = await client.account.findUniqueOrThrow({ where: { id: a3.id } });

		expect(r1.balance).toBe(90);
		expect(r2.balance).toBe(110);
		expect(r3.balance).toBe(110);
	});

	it("should allow nested transactions in concurrent top-level transactions with Yates", async () => {
		const role = `USER_${uuid()}`;
		const client = await setup({
			prisma: createPrismaClient(),
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

		const a1 = await client.account.create({
			data: {
				email: `c-a1-${uuid()}@example.com`,
				balance: 100,
			},
		});
		const a2 = await client.account.create({
			data: {
				email: `c-a2-${uuid()}@example.com`,
				balance: 100,
			},
		});
		const b1 = await client.account.create({
			data: {
				email: `c-b1-${uuid()}@example.com`,
				balance: 100,
			},
		});
		const b2 = await client.account.create({
			data: {
				email: `c-b2-${uuid()}@example.com`,
				balance: 100,
			},
		});

		await Promise.all([
			client.$transaction(async (tx) => {
				await tx.account.update({
					where: { id: a1.id },
					data: { balance: { decrement: 10 } },
				});

				await tx.$transaction(async (tx2) => {
					await tx2.account.update({
						where: { id: a2.id },
						data: { balance: { increment: 10 } },
					});
				});
			}),
			client.$transaction(async (tx) => {
				await tx.account.update({
					where: { id: b1.id },
					data: { balance: { decrement: 10 } },
				});

				await tx.$transaction(async (tx2) => {
					await tx2.account.update({
						where: { id: b2.id },
						data: { balance: { increment: 10 } },
					});
				});
			}),
		]);

		const ra1 = await client.account.findUniqueOrThrow({
			where: { id: a1.id },
		});
		const ra2 = await client.account.findUniqueOrThrow({
			where: { id: a2.id },
		});
		const rb1 = await client.account.findUniqueOrThrow({
			where: { id: b1.id },
		});
		const rb2 = await client.account.findUniqueOrThrow({
			where: { id: b2.id },
		});

		expect(ra1.balance).toBe(90);
		expect(ra2.balance).toBe(110);
		expect(rb1.balance).toBe(90);
		expect(rb2.balance).toBe(110);
	});

	it("should rollback transactions if the outer transaction fails if you bypass yates", async () => {
		const role = `USER_${uuid()}`;
		const client = await setup({
			prisma: createPrismaClient(),
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
