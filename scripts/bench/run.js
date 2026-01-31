/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { PrismaClient } = require("@prisma/client");

const distPath = path.join(__dirname, "..", "..", "dist", "index.js");
if (!fs.existsSync(distPath)) {
	console.error("Missing dist build. Run `npm run build` first.");
	process.exit(1);
}

const { setup } = require(distPath);

const toInt = (value, fallback) => {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const iterations = toInt(process.env.BENCH_ITERS, 50);
const warmup = toInt(process.env.BENCH_WARMUP, 5);

const percentile = (values, p) => {
	if (!values.length) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
};

const summarize = (times) => {
	const total = times.reduce((sum, value) => sum + value, 0);
	return {
		count: times.length,
		mean: total / times.length,
		p50: percentile(times, 50),
		p95: percentile(times, 95),
		p99: percentile(times, 99),
		min: Math.min(...times),
		max: Math.max(...times),
	};
};

const main = async () => {
	const prisma = new PrismaClient();
	try {
		const user = await prisma.user.findFirst();
		if (!user) {
			console.error("No users found. Run `npm run bench:seed` first.");
			process.exit(1);
		}
		const role = "USER";

		const client = await setup({
			prisma,
			customAbilities: {
				Post: {
					readOwn: {
						description: "Read own posts",
						operation: "SELECT",
						expression: (_client, _row, context) => ({
							authorId: context("user.id"),
						}),
					},
					readPublished: {
						description: "Read published",
						operation: "SELECT",
						expression: () => ({ published: true }),
					},
					createOwn: {
						description: "Create own",
						operation: "INSERT",
						expression: (_client, _row, context) => ({
							authorId: context("user.id"),
						}),
					},
					updateOwn: {
						description: "Update own",
						operation: "UPDATE",
						expression: (_client, _row, context) => ({
							authorId: context("user.id"),
						}),
					},
				},
			},
			getRoles: (abilities) => ({
				[role]: [
					abilities.Post.readOwn,
					abilities.Post.readPublished,
					abilities.Post.createOwn,
					abilities.Post.updateOwn,
				],
			}),
			getContext: () => ({
				role,
				context: { "user.id": user.id },
			}),
		});

		const tags = await prisma.tag.findMany({ take: 5 });
		const tagConnect = tags.map((tag) => ({ id: tag.id }));

		const scenarios = [
			{
				name: "read_simple",
				fn: () =>
					client.post.findMany({
						where: { published: true },
						take: 50,
					}),
			},
			{
				name: "read_with_include",
				fn: () =>
					client.post.findMany({
						where: { published: true },
						include: { author: true, tags: true },
						take: 25,
					}),
			},
			{
				name: "create_with_tags",
				fn: () =>
					client.post.create({
						data: {
							title: `bench-${Date.now()}-${Math.random()}`,
							authorId: user.id,
							tags: { connect: tagConnect },
						},
					}),
			},
			{
				name: "update_owned",
				fn: async () => {
					const post = await client.post.findFirst({
						where: { authorId: user.id },
					});
					if (!post) return null;
					return client.post.update({
						where: { id: post.id },
						data: { title: `bench-updated-${Date.now()}` },
					});
				},
			},
			{
				name: "transaction_read",
				fn: () =>
					client.$transaction(async (tx) => {
						const a = await tx.post.findMany({ take: 20 });
						const b = await tx.post.count();
						return { a: a.length, b };
					}),
			},
		];

		const results = {};

		for (const scenario of scenarios) {
			// Warmup
			for (let i = 0; i < warmup; i += 1) {
				await scenario.fn();
			}

			const times = [];
			for (let i = 0; i < iterations; i += 1) {
				const start = performance.now();
				await scenario.fn();
				const end = performance.now();
				times.push(end - start);
			}
			results[scenario.name] = summarize(times);
		}

		const output = {
			meta: {
				iterations,
				warmup,
				timestamp: new Date().toISOString(),
			},
			results,
		};

		console.log(JSON.stringify(output, null, 2));
	} finally {
		await prisma.$disconnect();
	}
};

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
