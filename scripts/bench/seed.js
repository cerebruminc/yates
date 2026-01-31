/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");

const toInt = (value, fallback) => {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const seedConfig = {
	users: toInt(process.env.BENCH_USERS, 1000),
	posts: toInt(process.env.BENCH_POSTS, 20000),
	tags: toInt(process.env.BENCH_TAGS, 100),
	orgs: toInt(process.env.BENCH_ORGS, 50),
	roleAssignments: toInt(process.env.BENCH_ROLE_ASSIGNMENTS, 5000),
};

const rand = (max) => Math.floor(Math.random() * max);

const main = async () => {
	const prisma = new PrismaClient();
	try {
		console.log("Seeding benchmark data...");
		console.log(seedConfig);

		// Clean existing data (order matters due to FK constraints)
		await prisma.roleAssignment.deleteMany();
		await prisma.role.deleteMany();
		await prisma.tag.deleteMany();
		await prisma.post.deleteMany();
		await prisma.organization.deleteMany();
		await prisma.user.deleteMany();

		// Roles
		await prisma.role.createMany({
			data: [{ name: "USER" }, { name: "ORG_MEMBER" }],
		});
		const roles = await prisma.role.findMany();

		// Orgs
		const orgData = Array.from({ length: seedConfig.orgs }, (_, i) => ({
			name: `org-${i}`,
		}));
		await prisma.organization.createMany({ data: orgData });
		const orgs = await prisma.organization.findMany();

		// Users
		const userData = Array.from({ length: seedConfig.users }, (_, i) => ({
			email: `user-${i}@example.com`,
			name: `User ${i}`,
		}));
		await prisma.user.createMany({ data: userData });
		const users = await prisma.user.findMany();

		// Tags
		const tagData = Array.from({ length: seedConfig.tags }, (_, i) => ({
			label: `tag-${i}`,
		}));
		await prisma.tag.createMany({ data: tagData });
		const tags = await prisma.tag.findMany();

		// Role assignments
		const roleAssignments = Array.from(
			{ length: seedConfig.roleAssignments },
			() => ({
				userId: users[rand(users.length)].id,
				organizationId: orgs[rand(orgs.length)].id,
				roleId: roles[rand(roles.length)].id,
			}),
		);
		await prisma.roleAssignment.createMany({ data: roleAssignments });

		// Posts
		const postData = Array.from({ length: seedConfig.posts }, (_, i) => ({
			title: `post-${i}`,
			published: i % 2 === 0,
			authorId: users[rand(users.length)].id,
		}));
		await prisma.post.createMany({ data: postData });

		// Attach tags to a subset of posts
		const posts = await prisma.post.findMany({ select: { id: true } });
		const tagIds = tags.map((tag) => tag.id);
		const tagConnectOps = posts
			.slice(0, Math.min(posts.length, 500))
			.map((post) =>
				prisma.post.update({
					where: { id: post.id },
					data: {
						tags: {
							connect: [
								{ id: tagIds[rand(tagIds.length)] },
								{ id: tagIds[rand(tagIds.length)] },
							],
						},
					},
				}),
			);
		await prisma.$transaction(tagConnectOps);

		console.log("Seed complete.");
	} finally {
		await prisma.$disconnect();
	}
};

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
