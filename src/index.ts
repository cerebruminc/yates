import { Prisma, PrismaClient } from "@prisma/client";
import difference from "lodash/difference";
import flatMap from "lodash/flatMap";
import map from "lodash/map";
import toPairs from "lodash/toPairs";
import { Expression, expressionToSQL } from "./expressions";

const VALID_OPERATIONS = ["SELECT", "UPDATE", "INSERT", "DELETE"] as const;

type Operation = typeof VALID_OPERATIONS[number];
export type Models = Prisma.ModelName;
export interface Ability<ContextKeys extends string = string> {
	description?: string;
	expression?: Expression<ContextKeys>;
	operation: Operation;
	model?: Models;
	slug?: string;
}
type CRUDOperations = "read" | "create" | "update" | "delete";
export type DefaultAbilities = { [Model in Models]: { [op in CRUDOperations]: Ability } };
export type CustomAbilities<ContextKeys extends string = string> = {
	[model in Models]?: {
		[op in string]?: Ability<ContextKeys>;
	};
};

export type GetContextFn<ContextKeys extends string = string> = () => {
	role: string;
	context?: {
		[key in ContextKeys]: string | number | string[];
	};
} | null;

/**
 * This function is used to take a lock that is automatically released at the end of the current transaction.
 * This is very convenient for ensuring we don't hit concurrency issues when running setup code.
 */
const takeLock = (prisma: PrismaClient) =>
	prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(2142616474639426746);");

// Sanitize a single string by ensuring the it has only lowercase alpha characters and underscores
const sanitizeSlug = (slug: string) =>
	slug
		.toLowerCase()
		.replace("-", "_")
		.replace(/[^a-z0-9_]/gi, "");

export const createAbilityName = (model: string, ability: string) => {
	return sanitizeSlug(`yates_ability_${model}_${ability}_role`);
};

export const createRoleName = (name: string) => {
	// Ensure the role name only has lowercase alpha characters and underscores
	// This also doubles as a check against SQL injection
	return sanitizeSlug(`yates_role_${name}`);
};

// This middleware is used to set the role and context for the current user so that RLS can be applied
// It must be the *last* middleware in the chain, as it will call the original function itself and return the value.
export const setupMiddleware = (prisma: PrismaClient, getContext: GetContextFn) => {
	// Create a new admin client to use for unrestricted queries
	// This is required because the middleware is applied to the client, and so if we use the same client, we will
	// get an infinite loop and can trigger client middlewares multiple times
	const adminClient = new PrismaClient();

	prisma.$use(async (params, next) => {
		if (!params.model) {
			return next(params);
		}

		const ctx = getContext();

		// If ctx is null, the middleware is explicitly skipped
		if (ctx === null) {
			return next(params);
		}
		const { role, context } = ctx;

		const pgRole = createRoleName(role);

		// Generate model class name from model params (PascalCase to camelCase)
		const modelName = params.model.charAt(0).toLowerCase() + params.model.slice(1);

		if (context) {
			for (const k of Object.keys(context)) {
				if (!k.match(/^[a-z_\.]+$/)) {
					throw new Error(
						`Context variable "${k}" contains invalid characters. Context variables must only contain lowercase letters, numbers, periods and underscores.`,
					);
				}
				if (typeof context[k] !== "number" && typeof context[k] !== "string") {
					throw new Error(`Context variable "${k}" must be a string or number. Got ${typeof context[k]}`);
				}
			}
		}

		try {
			const txResults = await adminClient.$transaction([
				// Switch to the user role, We can't use a prepared statement here, due to limitations in PG not allowing prepared statements to be used in SET ROLE
				adminClient.$queryRawUnsafe(`SET ROLE ${pgRole}`),
				// Now set all the context variables using `set_config` so that they can be used in RLS
				...toPairs(context).map(([key, value]) => {
					return adminClient.$queryRaw`SELECT set_config(${key}, ${value.toString()},  true);`;
				}),
				...[
					// Now call original function
					// Assumptions:
					// - prisma model class is params.model in camelCase
					// - prisma function name is params.action
					(adminClient as any)[modelName][params.action](params.args),
					// Switch role back to admin user
					adminClient.$queryRawUnsafe("SET ROLE none"),
				],
			]);
			const queryResults = txResults[txResults.length - 2];

			// This heuristic is used to determine if this is a query for a related entity, and if so, unwraps the results.
			// This mimics the "native" prisma behaviour, where if you query for a related entity, it will return the related entity (or entities) directly, rather than an object with the related entity as a property.
			// See https://prisma.slack.com/archives/CA491RJH0/p1674126834205399
			if (params.args.select) {
				const selectKeys = Object.keys(params.args.select);
				if (
					selectKeys.length === 1 &&
					params.dataPath.length > 0 &&
					selectKeys[0] === params.dataPath[params.dataPath.length - 1] &&
					selectKeys[0] === Object.keys(queryResults)[0]
				) {
					return queryResults[selectKeys[0]];
				}
			}
			return queryResults;
		} catch (e) {
			// Normalize RLS errors to make them a bit more readable.
			if (e.message?.includes("new row violates row-level security policy for table")) {
				throw new Error("You do not have permission to perform this action.");
			}

			throw e;
		}
	});
};

const setRLS = async (
	prisma: PrismaClient,
	table: string,
	roleName: string,
	operation: Operation,
	rawExpression: Expression,
) => {
	let expression = await expressionToSQL(rawExpression, table);

	// Check if RLS exists
	const policyName = `${roleName}_policy`;
	const rows: any[] = await prisma.$queryRawUnsafe(`
		select * from pg_catalog.pg_policies where tablename = '${table}' AND policyname = '${policyName}';
	`);
	// IF RLS doesn't exist or expression is different, set RLS
	if (rows.length === 0) {
		// If the operation is an insert or update, we need to use a different syntax as the "WITH CHECK" expression is used.
		if (operation === "INSERT") {
			await prisma.$queryRawUnsafe(`
        CREATE POLICY ${policyName} ON "public"."${table}" FOR ${operation} TO ${roleName} WITH CHECK (${expression});
      `);
		} else {
			await prisma.$queryRawUnsafe(`
        CREATE POLICY ${policyName} ON "public"."${table}" FOR ${operation} TO ${roleName} USING (${expression});
      `);
		}
	} else if (rows[0].qual !== expression) {
		if (operation === "INSERT") {
			await prisma.$queryRawUnsafe(`
        ALTER POLICY ${policyName} ON "public"."${table}" TO ${roleName} WITH CHECK (${expression});
      `);
		} else {
			await prisma.$queryRawUnsafe(`
        ALTER POLICY ${policyName} ON "public"."${table}" TO ${roleName} USING (${expression});
      `);
		}
	}
};

export const createRoles = async <K extends CustomAbilities = CustomAbilities, T = DefaultAbilities & K>({
	prisma,
	customAbilities,
	getRoles,
}: {
	prisma: PrismaClient;
	customAbilities?: Partial<K>;
	getRoles: (abilities: T) => {
		[key: string]: Ability[] | "*";
	};
}) => {
	const abilities: Partial<DefaultAbilities> = {};
	// See https://github.com/prisma/prisma/discussions/14777
	const models = (prisma as any)._baseDmmf.datamodel.models.map((m: any) => m.name) as Models[];
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
				model,
				slug: "create",
			},
			read: {
				description: `Read ${model}`,
				expression: "true",
				operation: "SELECT",
				model,
				slug: "read",
			},
			update: {
				description: `Update ${model}`,
				expression: "true",
				operation: "UPDATE",
				model,
				slug: "update",
			},
			delete: {
				description: `Delete ${model}`,
				expression: "true",
				operation: "DELETE",
				model,
				slug: "delete",
			},
		};
		if (customAbilities?.[model]) {
			for (const ability in customAbilities[model]) {
				const operation = customAbilities[model]![ability as CRUDOperations]?.operation;
				if (!operation) continue;
				abilities[model]![ability as CRUDOperations] = {
					...customAbilities[model]![ability],
					operation,
					model,
					slug: ability,
				};
			}
		}
	}

	const roles = getRoles(abilities as T);

	// For each of the models and abilities, create a role and a corresponding RLS policy
	// We can then mix & match these roles to create a user's permissions by granting them to a user role (like SUPER_ADMIN)
	for (const model in abilities) {
		const table = model;

		await prisma.$transaction([
			takeLock(prisma),
			prisma.$queryRawUnsafe(`ALTER table "${table}" enable row level security;`),
		]);

		for (const slug in abilities[model as keyof typeof abilities]) {
			const ability = abilities[model as keyof typeof abilities]![slug as CRUDOperations];

			if (!VALID_OPERATIONS.includes(ability.operation)) {
				throw new Error(`Invalid operation: ${ability.operation}`);
			}

			const roleName = createAbilityName(model, slug);

			// Check if role already exists
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

			if (ability.expression) {
				await setRLS(prisma, table, roleName, ability.operation, ability.expression);
			}
		}
	}

	// For each of the Cortex roles, create a role in the database and grant it the relevant permissions.
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
				: roleAbilities.map((ability) => createAbilityName(ability.model!, ability.slug!));

		// Note: We need to GRANT all on schema public so that we can resolve relation queries with prisma, as they will sometimes use a join table.
		// This is not ideal, but because we are using RLS, it's not a security risk. Any table with RLS also needs a corresponding policy for the role to have access.
		await prisma.$transaction([
			takeLock(prisma),
			prisma.$executeRawUnsafe(`GRANT ALL ON ALL TABLES IN SCHEMA public TO ${role};`),
			prisma.$executeRawUnsafe(`
				GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${role};
			`),
			prisma.$executeRawUnsafe(`
				GRANT ALL ON SCHEMA public TO ${role};
			`),
			prisma.$queryRawUnsafe(`GRANT ${rlsRoles.join(", ")} TO ${role}`),
		]);

		// Cleanup any old roles that aren't included in the new roles
		const userRoles: Array<{ oid: number; rolename: string }> = await prisma.$queryRawUnsafe(`
			WITH RECURSIVE cte AS (
				SELECT oid FROM pg_roles where rolname = '${role}'
				UNION ALL
				SELECT m.roleid
				FROM   cte
				JOIN   pg_auth_members m ON m.member = cte.oid
				)
			SELECT oid, oid::regrole::text AS rolename FROM cte where oid::regrole::text != '${role}'; 
	 `);

		const oldRoles = userRoles.filter(({ rolename }) => !rlsRoles.includes(rolename)).map(({ rolename }) => rolename);
		if (oldRoles.length) {
			// Now revoke old roles from the user role
			await prisma.$executeRawUnsafe(`REVOKE ${oldRoles.join(", ")} FROM ${role}`);
		}
	}
};

export interface SetupParams<
	ContextKeys extends string = string,
	K extends CustomAbilities<ContextKeys> = CustomAbilities<ContextKeys>,
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
	getRoles: (abilities: DefaultAbilities & K) => {
		[key: string]: Ability[] | "*";
	};
	/**
	 * A function that returns the context for the current request.
	 * This is called on every prisma query, and is needed to determine the current user's role.
	 * You can also provide additional context here, which will be available in any RLS expressions you've defined.
	 * Returning `null` will result in the permissions being skipped entirely.
	 */
	getContext: GetContextFn<ContextKeys>;
}

export const setup = async <
	ContextKeys extends string = string,
	K extends CustomAbilities<ContextKeys> = CustomAbilities<ContextKeys>,
>(
	params: SetupParams<ContextKeys, K>,
) => {
	const { prisma, customAbilities, getRoles, getContext } = params;
	await createRoles<K>({ prisma, customAbilities, getRoles });
	setupMiddleware(prisma, getContext);
};
