import { PrismaClient } from "@prisma/client";
import _ from "lodash";
import { v4 as uuid } from "uuid";
import { setup } from "../../src";

jest.setTimeout(30000);

let adminClient: PrismaClient;

beforeAll(async () => {
	adminClient = new PrismaClient();
});

describe("abilities", () => {
	it("should be able to handle long ability names", async () => {
		const initial = new PrismaClient();
		const role = `USER_${uuid()}`;

		const mail = `test-user-${uuid()}@example.com`;

		const dummyUser = await adminClient.user.create({
			data: {
				email: `test-user-${uuid()}@example.com`,
			},
		});

		const longAbilityName =
			"thisIsAnIncrediblyLongAbilityNameDesignedToTestTheSixtyThreeByteLimitOnRoleNamesInPostgres";

		const readAbility = `CAN_${longAbilityName}_USER_READ`;
		const writeAbility = `CAN_${longAbilityName}_USER_WRITE`;

		const client = await setup({
			prisma: initial,
			customAbilities: {
				User: {
					[readAbility]: {
						description: "Read",
						operation: "SELECT",
						expression: (_client, _row, _context) => {
							return {
								name: "John Doe",
							};
						},
					},
					[writeAbility]: {
						description: "Write",
						operation: "INSERT",
						expression: (_client, _row, _context) => {
							return {
								name: "John Doe",
							};
						},
					},
				},
			},
			getRoles(abilities) {
				return {
					[role]: [abilities.User[readAbility], abilities.User[writeAbility]],
				};
			},
			getContext: () => ({
				role,
				context: {},
			}),
		});

		const notFound = await client.user.findUnique({
			where: {
				id: dummyUser.id,
			},
		});

		expect(notFound).toBeNull();

		const user = await client.user.create({
			data: {
				name: "John Doe",
				email: mail,
			},
		});

		const ownUser = await client.user.findUnique({
			where: {
				id: user.id,
			},
		});

		expect(ownUser).toBeDefined();
	});
});
