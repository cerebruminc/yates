import { PrismaClient } from "@prisma/client";
import _ from "lodash";
import { setup } from "../../src";

const run = async () => {
	// it should error if an invalid model is used
	setup({
		prisma: new PrismaClient(),
		customAbilities: {
			// @ts-expect-error
			ThisModelDoesntExist: {
				readOwnUser: {
					description: "Read own user",
					operation: "SELECT",
					expression: "true",
				},
			},
		},
		// @ts-expect-error
		getRoles(abilities) {
			return {
				User: [abilities.User.readOwnUser],
			};
		},
		getContext: () => ({
			role: "User",
			context: {},
		}),
	});

	// It should error if an unknown custom ability is used
	setup({
		prisma: new PrismaClient(),
		customAbilities: {},
		getRoles(abilities) {
			return {
				// @ts-expect-error
				User: [abilities.User.superCustomAbility],
			};
		},
		getContext: () => ({
			role: "User",
			context: {},
		}),
	});

	// It should error if an incorrect where clause is used for a custom ability
	setup({
		prisma: new PrismaClient(),
		customAbilities: {
			User: {
				superCustomAbility: {
					description: "Super custom ability",
					operation: "SELECT",
					// @ts-expect-error
					expression: (_client, _row, _context) => {
						return {
							foo: "bar",
						};
					},
				},
			},
		},
		// @ts-expect-error
		getRoles(abilities) {
			return {
				User: [abilities.User.superCustomAbility],
			};
		},
		getContext: () => ({
			role: "User",
			context: {},
		}),
	});

	// It should error if an incorrect row key is used for a custom ability
	setup({
		prisma: new PrismaClient(),
		customAbilities: {
			User: {
				superCustomAbility: {
					description: "Super custom ability",
					operation: "SELECT",
					// @ts-expect-error
					expression: (_client, row, _context) => {
						return {
							// @ts-expect-error
							id: row("foo"),
						};
					},
				},
			},
		},
		// @ts-expect-error
		getRoles(abilities) {
			return {
				User: [abilities.User.superCustomAbility],
			};
		},
		getContext: () => ({
			role: "User",
			context: {},
		}),
	});

	// It should error if an incorrect context key is used for a custom ability
	setup({
		prisma: new PrismaClient(),
		customAbilities: {
			User: {
				superCustomAbility: {
					description: "Super custom ability",
					operation: "SELECT",
					expression: (_client, _row, context) => {
						return {
							// @ts-expect-error
							id: context("foo"),
						};
					},
				},
			},
		},
		getRoles(abilities) {
			return {
				User: [abilities.User.superCustomAbility],
			};
		},
		getContext: () => ({
			role: "User",
			context: {
				"user.id": "123",
			},
		}),
	});
};
