import * as crypto from "crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import logger from "debug";
import difference from "lodash/difference";
import flatMap from "lodash/flatMap";
import map from "lodash/map";
import toPairs from "lodash/toPairs";
import { Expression, RuntimeDataModel, expressionToSQL } from "./expressions";

const VALID_OPERATIONS = ["SELECT", "UPDATE", "INSERT", "DELETE"] as const;

const debug = logger("yates");

type Operation = (typeof VALID_OPERATIONS)[number];
export type Models = Prisma.ModelName;

interface PgYatesAbility {
	id: number;
	ability_model: string;
	ability_name: string;
	ability_policy_name: string;
	ability_description: string;
	ability_operation: string;
	ability_expression: string;
}

interface PgPolicy {
	policyname: string;
	tablename: string;
	cmd: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
	qual: string | null;
	with_check: string | null;
}

interface PgRole {
	rolname: string;
}

interface ClientOptions {
	/** The maximum amount of time Yates will wait to acquire a transaction from the database. The default value is 30 seconds. */
	txMaxWait?: number;
	/** The maximum amount of time the Yates query transaction can run before being canceled and rolled back. The default value is 30 seconds. */
	txTimeout?: number;
}

export interface Ability<ContextKeys extends string, M extends Models> {
	description?: string;
	expression?: Expression<ContextKeys, M>;
	operation: Operation;
	model?: M;
	slug?: string;
}

// This creates a union type of all possible abilities for a given set of models
export type AllAbilities<ContextKeys extends string, YModels extends Models> = {
	[model in YModels]: Ability<ContextKeys, model>;
}[YModels];

type CRUDOperations = "read" | "create" | "update" | "delete";
export type DefaultAbilities<
	ContextKeys extends string = string,
	YModels extends Models = Models,
> = {
	[Model in YModels]: {
		[op in CRUDOperations]: Ability<ContextKeys, Model>;
	};
};
export type CustomAbilities<
	ContextKeys extends string = string,
	YModels extends Models = Models,
> = {
	[model in YModels]?: {
		[op in string]?: Ability<ContextKeys, model>;
	};
};

export type GetContextFn<ContextKeys extends string = string> = () => {
	role: string;
	transactionId?: string;
	context?: {
		[key in ContextKeys]: string | number | string[];
	};
} | null;

declare module "@prisma/client" {
	interface PrismaClient {
		// biome-ignore lint/suspicious/noExplicitAny: TODO fix this
		_executeRequest: (params: any) => Promise<any>;
	}
}

/**
 * This function is used to take a lock that is automatically released at the end of the current transaction.
 * This is very convenient for ensuring we don't hit concurrency issues when running setup code.
 */
const takeLock = (prisma: PrismaClient) =>
	prisma.$executeRawUnsafe(
		"SELECT pg_advisory_xact_lock(2142616474639426746);",
	);

/*
 * This function creates a table used to track the abilities that have been
 * defined in the system. We can use this to see if an ability needs to be updated.
 * We can't look up the pg policy table for this, as pg performs formatting on
 * the expression, making it very hard to check if the two expressions are equivalent.
 *
 * We also need to create a schema for this table, as we don't want to pollute the public schema.
 * If we use the public schema, we could potentially conflict with a user's table and we will
 * also cause issues for Prisma's migrate tooling, as it will detect a DB drift.
 */
const setupAbilityTable = (prisma: PrismaClient) => {
	return prisma.$transaction([
		takeLock(prisma),
		prisma.$executeRawUnsafe(`
		CREATE SCHEMA IF NOT EXISTS _yates;
		`),
		prisma.$executeRawUnsafe(`
		CREATE TABLE IF NOT EXISTS _yates._yates_abilities (
			id SERIAL PRIMARY KEY,
			ability_model TEXT NOT NULL,
			ability_name TEXT NOT NULL,
			ability_policy_name TEXT NOT NULL UNIQUE,
			ability_description TEXT NOT NULL,
			ability_operation TEXT NOT NULL,
			ability_expression TEXT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP
		);
	`),
	]);
};

const upsertAbility = (
	prisma: PrismaClient,
	ability: Omit<PgYatesAbility, "id" | "created_at" | "updated_at">,
) => {
	const {
		ability_model,
		ability_name,
		ability_policy_name,
		ability_description,
		ability_operation,
		ability_expression,
	} = ability;
	return prisma.$queryRaw`
		INSERT INTO _yates._yates_abilities (ability_model, ability_name, ability_policy_name, ability_description, ability_operation, ability_expression)
		VALUES (${ability_model}, ${ability_name}, ${ability_policy_name}, ${ability_description}, ${ability_operation}, ${ability_expression})
		ON CONFLICT (ability_policy_name) DO UPDATE
		SET ability_model = EXCLUDED.ability_model, ability_name = EXCLUDED.ability_name, ability_description = EXCLUDED.ability_description, ability_operation = EXCLUDED.ability_operation, ability_expression = EXCLUDED.ability_expression, updated_at = now();
	`;
};

/**
 * In PostgreSQL, the maximum length for a role or policy name is 63 bytes.
 * This limitation is derived from the value of the NAMEDATALEN configuration parameter,
 * which is set to 64 bytes by default. One byte is reserved for the null-terminator,
 * leaving 63 bytes for the actual role name.
 * This function hashes the ability name to ensure it is within the 63 byte limit.
 */
const hashWithPrefix = (prefix: string, abilityName: string) => {
	const hash = crypto.createHash("sha256");
	hash.update(abilityName);
	const hashedAbilityName = hash.digest("hex");
	const maxLength = 63 - prefix.length;
	return prefix + hashedAbilityName.slice(0, maxLength);
};

// Sanitize a single string by ensuring the it has only lowercase alpha characters and underscores
const sanitizeSlug = (slug: string) =>
	slug
		.toLowerCase()
		.replace("-", "_")
		.replace(/[^a-z0-9_]/gi, "");

export const createAbilityName = (model: string, ability: string) => {
	return sanitizeSlug(hashWithPrefix("yates_ability_", `${model}_${ability}`));
};

export const createRoleName = (name: string) => {
	return sanitizeSlug(hashWithPrefix("yates_role_", `${name}`));
};

// This uses client extensions to set the role and context for the current user so that RLS can be applied
export const createClient = (
	prisma: PrismaClient,
	getContext: GetContextFn,
	options: ClientOptions = {},
) => {
	// Set default options
	const { txMaxWait = 30000, txTimeout = 30000 } = options;

	// biome-ignore lint/suspicious/noExplicitAny: TODO fix this
	(prisma as any)._transactionWithCallback = async function ({
		callback,
		options,
	}: {
		callback: (client: any) => Promise<unknown>;
		options?: any;
	}) {
		const headers = { traceparent: this._tracingHelper.getTraceParent() };

		const optionsWithDefaults: any = {
			maxWait:
				options?.maxWait ?? this._engineConfig.transactionOptions.maxWait,
			timeout:
				options?.timeout ?? this._engineConfig.transactionOptions.timeout,
			isolationLevel:
				options?.isolationLevel ??
				this._engineConfig.transactionOptions.isolationLevel,
			new_tx_id: options?.new_tx_id ?? undefined,
		};
		const info = await this._engine.transaction(
			"start",
			headers,
			optionsWithDefaults,
		);

		let result: unknown;
		try {
			// execute user logic with a proxied the client
			const transaction = { kind: "itx", ...info } as const;

			result = await callback(this._createItxClient(transaction));

			// it went well, then we commit the transaction
			await this._engine.transaction("commit", headers, info);
		} catch (e: any) {
			// it went bad, then we rollback the transaction
			await this._engine.transaction("rollback", headers, info).catch(() => {});

			throw e; // silent rollback, throw original error
		}

		return result;
	};

	const client = prisma.$extends({
		name: "Yates client",
		query: {
			$allModels: {
				async $allOperations(params) {
					const { model, args, query, operation } = params;
					if (!model) {
						// If the model is not defined, we can't apply RLS
						// This can occur when you are making a call with Prisma's $queryRaw method
						// biome-ignore lint/suspicious/noExplicitAny: See above
						return (query as any)(args);
					}

					const ctx = getContext();

					// If ctx is null, the middleware is explicitly skipped
					if (ctx === null) {
						return query(args);
					}

					const { role, context } = ctx;

					const pgRole = createRoleName(role);

					if (context) {
						for (const k of Object.keys(context)) {
							if (!k.match(/^[a-z_\.]+$/)) {
								throw new Error(
									`Context variable "${k}" contains invalid characters. Context variables must only contain lowercase letters, numbers, periods and underscores.`,
								);
							}
							if (
								typeof context[k] !== "number" &&
								typeof context[k] !== "string" &&
								!Array.isArray(context[k])
							) {
								throw new Error(
									`Context variable "${k}" must be a string, number or array. Got ${typeof context[
										k
									]}`,
								);
							}
							if (Array.isArray(context[k])) {
								for (const v of context[k] as unknown[]) {
									if (typeof v !== "string") {
										throw new Error(
											`Context variable "${k}" must be an array of strings. Got ${typeof v}`,
										);
									}
								}
								// Cast to a JSON string so that it can be used in RLS expressions
								context[k] = JSON.stringify(context[k]);
							}
						}
					}

					try {
						const txId =
							ctx.transactionId ??
							hashWithPrefix("yates_tx_", JSON.stringify(ctx));
						// Because batch transactions inside a prisma client query extension can run out of order if used with async middleware,
						// we need to run the logic inside an interactive transaction, however this brings a different set of problems in that the
						// main query will no longer automatically run inside the transaction. We resolve this issue by manually executing the prisma request.
						// See https://github.com/prisma/prisma/issues/18276
						// @ts-ignore
						const queryResults = await prisma.$transaction(
							async (tx) => {
								// Switch to the user role, We can't use a prepared statement here, due to limitations in PG not allowing prepared statements to be used in SET ROLE
								await tx.$queryRawUnsafe(`SET ROLE ${pgRole}`);
								// Now set all the context variables using `set_config` so that they can be used in RLS
								for (const [key, value] of toPairs(context)) {
									await tx.$queryRaw`SELECT set_config(${key}, ${value.toString()},  true);`;
								}

								// Inconveniently, the `query` function will not run inside an interactive transaction.
								// We need to manually reconstruct the query, and attached the "secret" transaction ID.
								// This ensures that the query will run inside the transaction AND that middlewares will not be re-applied

								// https://github.com/prisma/prisma/blob/4.11.0/packages/client/src/runtime/getPrismaClient.ts#L1013
								// biome-ignore lint/suspicious/noExplicitAny: This is a private API, so not much we can do about it
								const txId = (tx as any)[
									Symbol.for("prisma.client.transaction.id")
								];

								// See https://github.com/prisma/prisma/blob/4.11.0/packages/client/src/runtime/getPrismaClient.ts#L860
								// biome-ignore lint/suspicious/noExplicitAny: This is a private API, so not much we can do about it
								const __internalParams = (params as any).__internalParams;
								const result = await prisma._executeRequest({
									...__internalParams,
									transaction: {
										kind: "itx",
										id: txId,
									},
								});
								// Switch role back to admin user
								await tx.$queryRawUnsafe("SET ROLE none");

								return result;
							},
							{
								maxWait: txMaxWait,
								timeout: txTimeout,
								new_tx_id: txId,
							},
						);

						return queryResults;
					} catch (e) {
						// Normalize RLS errors to make them a bit more readable.
						if (
							e.message?.includes(
								"new row violates row-level security policy for table",
							)
						) {
							throw new Error(
								`You do not have permission to perform this action: ${model}.${operation}(...)`,
							);
						}

						throw e;
					}
				},
			},
		},
	});

	return client;
};

const setRLS = async <ContextKeys extends string, YModel extends Models>(
	prisma: PrismaClient,
	table: string,
	roleName: string,
	slug: string,
	ability: Ability<ContextKeys, YModel>,
) => {
	const { operation, expression: rawExpression, description } = ability;
	if (!rawExpression) {
		throw new Error("Expression must be defined for RLS abilities");
	}

	// Take a lock and run the RLS setup in a transaction to prevent conflicts
	// in a multi-server environment
	await prisma.$transaction(async (tx) => {
		await takeLock(tx as PrismaClient);
		// Check if RLS exists
		const policyName = roleName;
		const existingAbilities: PgYatesAbility[] = await tx.$queryRaw`
			select * from _yates._yates_abilities where ability_model = ${table} and ability_policy_name = ${policyName}
		`;
		const existingAbility = existingAbilities[0];

		let shouldUpdateAbilityTable = false;

		// IF RLS doesn't exist or expression is different, set RLS
		if (!existingAbility) {
			debug("Creating RLS policy for", roleName, "on", table, "for", operation);
			const expression = await expressionToSQL(rawExpression, table);

			// If the operation is an insert or update, we need to use a different syntax as the "WITH CHECK" expression is used.
			if (operation === "INSERT") {
				await tx.$queryRawUnsafe(`
				CREATE POLICY ${policyName} ON "public"."${table}" FOR ${operation} TO ${roleName} WITH CHECK (${expression});
			`);
			} else {
				await tx.$queryRawUnsafe(`
				CREATE POLICY ${policyName} ON "public"."${table}" FOR ${operation} TO ${roleName} USING (${expression});
			`);
			}
			shouldUpdateAbilityTable = true;
		} else if (
			existingAbility.ability_expression !== rawExpression.toString()
		) {
			debug("Updating RLS policy for", roleName, "on", table, "for", operation);
			const expression = await expressionToSQL(rawExpression, table);
			if (operation === "INSERT") {
				await tx.$queryRawUnsafe(`
				ALTER POLICY ${policyName} ON "public"."${table}" TO ${roleName} WITH CHECK (${expression});
			`);
			} else {
				await tx.$queryRawUnsafe(`
				ALTER POLICY ${policyName} ON "public"."${table}" TO ${roleName} USING (${expression});
			`);
			}
			shouldUpdateAbilityTable = true;
		}

		if (shouldUpdateAbilityTable) {
			await upsertAbility(tx as PrismaClient, {
				ability_model: table,
				ability_name: slug,
				ability_policy_name: policyName,
				ability_description: description ?? "",
				ability_operation: operation,
				// We store the string representation of the expression so that
				// we can compare it later without having to recompute the SQL
				ability_expression: rawExpression.toString(),
			});
		}
	});
};

export const createRoles = async <
	ContextKeys extends string,
	YModels extends Models,
	K extends CustomAbilities = CustomAbilities,
	T = DefaultAbilities<ContextKeys, YModels> & K,
>({
	prisma,
	customAbilities,
	getRoles,
}: {
	prisma: PrismaClient;
	customAbilities?: Partial<K>;
	getRoles: (abilities: T) => {
		[role: string]: AllAbilities<ContextKeys, YModels>[] | "*";
	};
}) => {
	const abilities: Partial<DefaultAbilities> = {};
	// See https://github.com/prisma/prisma/discussions/14777
	// We are reaching into the prisma internals to get the data model.
	// This is a bit sketchy, but we can get the internal type definition from the runtime library
	// and there is even a test case in prisma that checks that this value is exported
	// See https://github.com/prisma/prisma/blob/5.1.0/packages/client/tests/functional/extensions/pdp.ts#L51
	// biome-ignore lint/suspicious/noExplicitAny: This is a private API, so not much we can do about it
	const runtimeDataModel = (prisma as any)
		._runtimeDataModel as RuntimeDataModel;
	const models = Object.keys(runtimeDataModel.models).map(
		(m) => runtimeDataModel.models[m].dbName || m,
	) as Models[];
	if (customAbilities) {
		const diff = difference(Object.keys(customAbilities), models);
		if (diff.length) {
			throw new Error(`Invalid models in custom abilities: ${diff.join(", ")}`);
		}
	}
	for (const model of models) {
		abilities[model] = {
			create: {
				description: `Create ${model}`,
				expression: "true",
				operation: "INSERT",
				// biome-ignore lint/suspicious/noExplicitAny: TODO fix this
				model: model as any,
				slug: "create",
			},
			read: {
				description: `Read ${model}`,
				expression: "true",
				operation: "SELECT",
				// biome-ignore lint/suspicious/noExplicitAny: TODO fix this
				model: model as any,
				slug: "read",
			},
			update: {
				description: `Update ${model}`,
				expression: "true",
				operation: "UPDATE",
				// biome-ignore lint/suspicious/noExplicitAny: TODO fix this
				model: model as any,
				slug: "update",
			},
			delete: {
				description: `Delete ${model}`,
				expression: "true",
				operation: "DELETE",
				// biome-ignore lint/suspicious/noExplicitAny: TODO fix this
				model: model as any,
				slug: "delete",
			},
		};
		if (customAbilities?.[model]) {
			for (const ability in customAbilities[model]) {
				const operation =
					// biome-ignore lint/style/noNonNullAssertion: TODO fix this
					customAbilities[model]![ability as CRUDOperations]?.operation;
				if (!operation) continue;
				// biome-ignore lint/style/noNonNullAssertion: TODO fix this
				abilities[model]![ability as CRUDOperations] = {
					// biome-ignore lint/style/noNonNullAssertion: TODO fix this
					...customAbilities[model]![ability],
					operation,
					// biome-ignore lint/suspicious/noExplicitAny: TODO fix this
					model: model as any,
					slug: ability,
				};
			}
		}
	}

	debug("Setting up ability table");
	await setupAbilityTable(prisma);

	const roles = getRoles(abilities as T);

	const pgRoles: PgRole[] = await prisma.$queryRawUnsafe(`
		select * from pg_catalog.pg_roles where rolname like 'yates%'
	`);
	const existingAbilities: PgYatesAbility[] = await prisma.$queryRawUnsafe(`
		select * from _yates._yates_abilities;
	`);

	// If this a first time setup, we may need to import existing abilities from
	// the pg_policies table into the new abilities lookup table.
	if (existingAbilities.length === 0) {
		debug('No existing abilities found, importing from "pg_policies" table');
		const pgPolicies: PgPolicy[] = await prisma.$queryRawUnsafe(`
			select * from pg_catalog.pg_policies where policyname like 'yates%'
		`);

		if (pgPolicies.length) {
			const migratedAbilities = pgPolicies.map((policy) => ({
				ability_model: policy.tablename,
				ability_name: policy.policyname,
				ability_policy_name: policy.policyname,
				ability_description: "",
				ability_operation: policy.cmd,
				ability_expression: policy.qual ?? policy.with_check ?? "",
			}));

			await prisma.$transaction([
				takeLock(prisma),
				...migratedAbilities.map((ma) => upsertAbility(prisma, ma)),
			]);

			existingAbilities.push(...(migratedAbilities as PgYatesAbility[]));
		}
	}

	// For each of the models and abilities, create a role and a corresponding RLS policy
	// We can then mix & match these roles to create a user's permissions by granting them to a user role (like SUPER_ADMIN)
	for (const model in abilities) {
		const table = model;

		await prisma.$transaction([
			takeLock(prisma),
			prisma.$queryRawUnsafe(
				`ALTER table "${table}" enable row level security;`,
			),
		]);

		for (const slug in abilities[model as keyof typeof abilities]) {
			const ability =
				// biome-ignore lint/style/noNonNullAssertion: TODO fix this
				abilities[model as keyof typeof abilities]![slug as CRUDOperations];

			if (!VALID_OPERATIONS.includes(ability.operation)) {
				throw new Error(`Invalid operation: ${ability.operation}`);
			}

			const roleName = createAbilityName(model, slug);

			// Check if role already exists
			if (
				pgRoles.find((role: { rolname: string }) => role.rolname === roleName)
			) {
				debug("Role already exists", roleName);
			} else {
				await prisma.$transaction([
					takeLock(prisma),
					prisma.$queryRawUnsafe(`
					do
					$$
					begin
					if not exists (select * from pg_catalog.pg_roles where rolname = '${roleName}') then 
						create role ${roleName};
					end if;
					end
					$$
					;
				`),
					prisma.$queryRawUnsafe(`
					GRANT ${ability.operation} ON "${table}" TO ${roleName};
				`),
				]);
			}

			if (ability.expression) {
				await setRLS(
					prisma,
					table,
					roleName,
					slug,
					// biome-ignore lint/suspicious/noExplicitAny: TODO fix this
					ability as any,
				);
			}
		}
	}

	// For each of the given roles, create a role in the database and grant it the relevant permissions.
	// By defining each permission as a seperate role, we can GRANT them to the user role here, re-using them.
	// It's not possible to dynamically GRANT these to a shared user role, as the GRANT is not isolated per transaction and leads to broken permissions.
	for (const key in roles) {
		const role = createRoleName(key);
		await prisma.$executeRawUnsafe(`
			do
			$$
			begin
			if not exists (select * from pg_catalog.pg_roles where rolname = '${role}') then 
				create role ${role};
			end if;
			end
			$$
			;
		`);

		const wildCardAbilities = flatMap(abilities, (model, modelName) => {
			return map(model, (_params, slug) => {
				return createAbilityName(modelName, slug);
			});
		});
		const roleAbilities = roles[key];
		const rlsRoles =
			roleAbilities === "*"
				? wildCardAbilities
				: roleAbilities.map((ability) =>
						// biome-ignore lint/style/noNonNullAssertion: TODO fix this
						createAbilityName(ability.model!, ability.slug!),
				  );

		// Note: We need to GRANT all on schema public so that we can resolve relation queries with prisma, as they will sometimes use a join table.
		// This is not ideal, but because we are using RLS, it's not a security risk. Any table with RLS also needs a corresponding policy for the role to have access.
		await prisma.$transaction([
			takeLock(prisma),
			prisma.$executeRawUnsafe(
				`GRANT ALL ON ALL TABLES IN SCHEMA public TO ${role};`,
			),
			prisma.$executeRawUnsafe(`
				GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${role};
			`),
			prisma.$executeRawUnsafe(`
				GRANT ALL ON SCHEMA public TO ${role};
			`),
			prisma.$queryRawUnsafe(`GRANT ${rlsRoles.join(", ")} TO ${role}`),
		]);

		// Cleanup any old roles that aren't included in the new roles
		const userRoles: Array<{ oid: number; rolename: string }> =
			await prisma.$queryRawUnsafe(`
			WITH RECURSIVE cte AS (
				SELECT oid FROM pg_roles where rolname = '${role}'
				UNION ALL
				SELECT m.roleid
				FROM   cte
				JOIN   pg_auth_members m ON m.member = cte.oid
				)
			SELECT oid, oid::regrole::text AS rolename FROM cte where oid::regrole::text != '${role}'; 
	 `);

		const oldRoles = userRoles
			.filter(({ rolename }) => !rlsRoles.includes(rolename))
			.map(({ rolename }) => rolename);

		if (oldRoles.length) {
			// Now revoke old roles from the user role
			debug("Revoking old roles", oldRoles.join(", "));
			await prisma.$executeRawUnsafe(
				`REVOKE ${oldRoles.join(", ")} FROM ${role}`,
			);
			const policies = await prisma.$queryRawUnsafe<PgPolicy[]>(
				`SELECT * FROM pg_catalog.pg_policies WHERE policyname IN (${oldRoles
					.map((or) => `'${or}'`)
					.join(", ")})`,
			);
			await prisma.$transaction([
				takeLock(prisma),
				...policies.map((oldPolicy) =>
					prisma.$executeRawUnsafe(
						`DROP POLICY ${oldPolicy.policyname} ON "${oldPolicy.tablename}"`,
					),
				),
			]);

			debug("Revoked old rows from ability table", oldRoles.join(", "));
			await prisma.$executeRawUnsafe(
				`DELETE FROM _yates._yates_abilities WHERE ability_policy_name IN (${oldRoles
					.map((or) => `'${or}'`)
					.join(", ")})`,
			);
		}
	}
};

export interface SetupParams<
	ContextKeys extends string = string,
	YModels extends Models = Models,
	K extends CustomAbilities<ContextKeys, YModels> = CustomAbilities<
		ContextKeys,
		YModels
	>,
> {
	/**
	 * The Prisma client instance. Used for database queries and model introspection.
	 */
	prisma: PrismaClient;
	/**
	 * Custom abilities to add to the default abilities.
	 */
	customAbilities?: K;
	/**
	 * A function that returns the roles for your application.
	 * This is paramaterised by the abilities, so you can use it to create roles that are a combination of abilities.
	 */
	getRoles: (abilities: DefaultAbilities<ContextKeys, YModels> & K) => {
		[role: string]: AllAbilities<ContextKeys, YModels>[] | "*";
	};
	/**
	 * A function that returns the context for the current request.
	 * This is called on every prisma query, and is needed to determine the current user's role.
	 * You can also provide additional context here, which will be available in any RLS expressions you've defined.
	 * Returning `null` will result in the permissions being skipped entirely.
	 */
	getContext: GetContextFn<ContextKeys>;
	options?: ClientOptions;
}

/**
 * Creates an extended client that sets contextual parameters and user role on every query
 **/
export const setup = async <
	ContextKeys extends string = string,
	YModels extends Models = Models,
	K extends CustomAbilities<ContextKeys, YModels> = CustomAbilities<
		ContextKeys,
		YModels
	>,
>(
	params: SetupParams<ContextKeys, YModels, K>,
) => {
	const start = performance.now();

	const { prisma, customAbilities, getRoles, getContext } = params;
	await createRoles<ContextKeys, YModels, K>({
		prisma,
		customAbilities,
		getRoles,
	});
	const client = createClient(prisma, getContext, params.options);

	debug("Setup completed in", performance.now() - start, "ms");

	return client;
};
