import * as crypto from "crypto";
import { Prisma, PrismaClient, PrismaPromise } from "@prisma/client";
import logger from "debug";
import cloneDeep from "lodash/cloneDeep";
import difference from "lodash/difference";
import flatMap from "lodash/flatMap";
import map from "lodash/map";
import toPairs from "lodash/toPairs";
import { Expression, RuntimeDataModel, expressionToSQL } from "./expressions";

const VALID_OPERATIONS = ["SELECT", "UPDATE", "INSERT", "DELETE"] as const;
const SETUP_MANIFEST_VERSION = "1";
const YATES_VERSION = require("../package.json").version as string;

const debug = logger("yates");

interface Batch {
	pgRole: string;
	context?: { [x: string]: string | number | string[] };
	requests: Array<{
		params: object;
		query: (args: unknown[]) => PrismaPromise<unknown>;
		args: unknown;
		resolve: (result: unknown) => void;
		reject: (error: unknown) => void;
	}>;
}

type Operation = (typeof VALID_OPERATIONS)[number];
export type Models = Prisma.ModelName;
type PrismaExecutor = Pick<
	PrismaClient,
	"$executeRawUnsafe" | "$queryRawUnsafe" | "$queryRaw"
>;

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

interface PgClassRLSState {
	relrowsecurity: boolean;
}

interface ResolvedSetupAbilityExpression {
	abilityExpression: string;
	policyExpression: string;
}

interface PgYatesSchemaSync {
	manifest_hash: string;
}

export interface SetupMetadata {
	appName?: string;
	appRevision?: string;
	appVersion?: string;
}

export interface SetupValidationResult {
	actualHash: string;
	expectedHash: string;
	manifestId: string;
}

export interface SetupManifestAbility {
	expression: string | null;
	model: string;
	operation: Operation;
	policyName: string;
	slug: string;
}

export interface SetupManifestRole {
	grants: string[] | "*";
	roleName: string;
}

export interface SetupManifest {
	abilities: SetupManifestAbility[];
	databaseScope: string;
	roles: SetupManifestRole[];
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
		_executeRequest: (params: any) => Promise<any>;
	}
}

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
	 * This is parameterised by the abilities, so you can use it to create roles that are a combination of abilities.
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
	metadata?: SetupMetadata;
	options?: ClientOptions;
}

export type SetupMigrationParams<
	ContextKeys extends string = string,
	YModels extends Models = Models,
	K extends CustomAbilities<ContextKeys, YModels> = CustomAbilities<
		ContextKeys,
		YModels
	>,
> = Omit<SetupParams<ContextKeys, YModels, K>, "getContext">;

export class YatesSetupManifestMismatchError extends Error {
	constructor(
		public readonly manifestId: string,
		public readonly expectedHash: string,
		public readonly actualHash: string | null,
	) {
		super(
			`Yates setup manifest mismatch for ${manifestId}. Expected ${expectedHash}, found ${
				actualHash ?? "none"
			}. Run the explicit Yates migration before starting the runtime client.`,
		);
		this.name = "YatesSetupManifestMismatchError";
	}
}

/**
 * This function is used to take a lock that is automatically released at the end of the current transaction.
 * This is very convenient for ensuring we don't hit concurrency issues when running setup code.
 */
const takeLock = (prisma: PrismaExecutor) =>
	prisma.$executeRawUnsafe(
		"SELECT pg_advisory_xact_lock(2142616474639426746);",
	);

const upsertAbility = (
	prisma: PrismaExecutor,
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

const isMissingYatesSchemaError = (error: unknown) => {
	const code = (error as { code?: string })?.code;
	const message = (error as { message?: string })?.message ?? "";
	return (
		code === "42P01" ||
		code === "3F000" ||
		message.includes("_yates_schema_syncs") ||
		message.includes('schema "_yates" does not exist')
	);
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
export const sanitizeSlug = (slug: string) =>
	slug
		.toLowerCase()
		.replace(/-/g, "_")
		.replace(/[^a-z0-9_]/gi, "");

export class Yates {
	private databaseScope: string | null = null;

	constructor(private prisma: PrismaClient) {}

	init = async () => {
		await this.ensureDatabaseScope();
		debug("Setting up ability table");
		await this.setupAbilityTable();
	};

	createDatabaseScope = (databaseName: string) => {
		const sanitizedName = sanitizeSlug(databaseName);

		if (sanitizedName.length > 0) {
			return sanitizedName;
		}

		const hash = crypto.createHash("sha256");
		hash.update(databaseName);
		return hash.digest("hex").slice(0, 8);
	};

	getDatabaseScope = () => {
		if (!this.databaseScope) {
			throw new Error(
				"Yates database scope has not been initialised. Ensure setup() has been called before using the client.",
			);
		}

		return this.databaseScope;
	};

	ensureDatabaseScope = async () => {
		if (this.databaseScope) {
			return this.databaseScope;
		}

		const result = await this.prisma.$queryRawUnsafe<
			{ current_database: string }[]
		>("select current_database() as current_database;");

		const currentDatabase = result[0]?.current_database;

		debug("Current database for Yates:", currentDatabase);

		if (!currentDatabase) {
			throw new Error(
				"Failed to determine the current database for scoping Yates roles.",
			);
		}

		this.databaseScope = this.createDatabaseScope(currentDatabase);

		return this.databaseScope;
	};

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
	setupAbilityTable = () => {
		return this.prisma.$transaction([
			takeLock(this.prisma),
			this.prisma.$executeRawUnsafe(`
				CREATE SCHEMA IF NOT EXISTS _yates;
			`),
			this.prisma.$executeRawUnsafe(`
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
			this.prisma.$executeRawUnsafe(`
				CREATE TABLE IF NOT EXISTS _yates._yates_schema_syncs (
					id TEXT PRIMARY KEY,
					manifest_hash TEXT NOT NULL,
					manifest_version TEXT,
					yates_version TEXT,
					app_name TEXT,
					app_version TEXT,
					app_revision TEXT,
					applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
				);
			`),
			this.prisma.$executeRawUnsafe(`
				DO $$
				BEGIN
					IF EXISTS (
						SELECT 1 FROM information_schema.columns
						WHERE table_schema = '_yates'
						AND table_name = '_yates_schema_syncs'
						AND column_name = 'yates_version'
					) AND NOT EXISTS (
						SELECT 1 FROM information_schema.columns
						WHERE table_schema = '_yates'
						AND table_name = '_yates_schema_syncs'
						AND column_name = 'manifest_version'
					) THEN
						ALTER TABLE _yates._yates_schema_syncs RENAME COLUMN yates_version TO manifest_version;
					ELSIF NOT EXISTS (
						SELECT 1 FROM information_schema.columns
						WHERE table_schema = '_yates'
						AND table_name = '_yates_schema_syncs'
						AND column_name = 'manifest_version'
					) THEN
						ALTER TABLE _yates._yates_schema_syncs ADD COLUMN manifest_version TEXT;
					END IF;

					IF NOT EXISTS (
						SELECT 1 FROM information_schema.columns
						WHERE table_schema = '_yates'
						AND table_name = '_yates_schema_syncs'
						AND column_name = 'yates_version'
					) THEN
						ALTER TABLE _yates._yates_schema_syncs ADD COLUMN yates_version TEXT;
					END IF;

					IF NOT EXISTS (
						SELECT 1 FROM information_schema.columns
						WHERE table_schema = '_yates'
						AND table_name = '_yates_schema_syncs'
						AND column_name = 'app_version'
					) THEN
						ALTER TABLE _yates._yates_schema_syncs ADD COLUMN app_version TEXT;
					END IF;

					IF NOT EXISTS (
						SELECT 1 FROM information_schema.columns
						WHERE table_schema = '_yates'
						AND table_name = '_yates_schema_syncs'
						AND column_name = 'app_revision'
					) THEN
						ALTER TABLE _yates._yates_schema_syncs ADD COLUMN app_revision TEXT;
					END IF;
				END
				$$;
			`),
		]);
	};

	createAbilityName = (model: string, ability: string) => {
		const scope = this.getDatabaseScope();

		return sanitizeSlug(
			hashWithPrefix("yates_ability_", `${scope}_${model}_${ability}`),
		);
	};

	createRoleName = (name: string) => {
		const scope = this.getDatabaseScope();

		return sanitizeSlug(hashWithPrefix("yates_role_", `${scope}_${name}`));
	};

	quoteIdentifier = (identifier: string) =>
		`"${identifier.replace(/"/g, '""')}"`;

	enableRowLevelSecurityIfNeeded = async (
		prisma: Pick<PrismaClient, "$executeRawUnsafe" | "$queryRawUnsafe">,
		table: string,
	) => {
		const rlsState = await prisma.$queryRawUnsafe<PgClassRLSState[]>(
			`
				SELECT c.relrowsecurity
				FROM pg_catalog.pg_class c
				JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
				WHERE n.nspname = 'public'
				AND c.relname = $1
				AND c.relkind IN ('r', 'p')
				LIMIT 1;
			`,
			table,
		);

		if (rlsState[0]?.relrowsecurity) {
			debug("Row level security already enabled for", table);
			return;
		}

		debug("Enabling row level security for", table);
		await prisma.$executeRawUnsafe(
			`ALTER table ${this.quoteIdentifier("public")}.${this.quoteIdentifier(
				table,
			)} enable row level security;`,
		);
	};

	createSetupManifestHash = (manifest: SetupManifest) => {
		const normalizedManifest = {
			abilities: [...manifest.abilities].sort((a, b) =>
				`${a.model}:${a.slug}:${a.operation}:${a.policyName}`.localeCompare(
					`${b.model}:${b.slug}:${b.operation}:${b.policyName}`,
				),
			),
			databaseScope: manifest.databaseScope,
			roles: [...manifest.roles]
				.map((role) => ({
					...role,
					grants: Array.isArray(role.grants)
						? [...role.grants].sort()
						: role.grants,
				}))
				.sort((a, b) => a.roleName.localeCompare(b.roleName)),
			version: SETUP_MANIFEST_VERSION,
		};

		const hash = crypto.createHash("sha256");
		hash.update(JSON.stringify(normalizedManifest));
		return hash.digest("hex");
	};

	createSetupManifest = (
		abilities: Partial<DefaultAbilities>,
		roles: {
			[role: string]: AllAbilities<string, Models>[] | "*";
		},
	) => {
		const manifestAbilities: SetupManifestAbility[] = [];
		for (const model of Object.keys(abilities).sort()) {
			const modelAbilities = abilities[model as keyof typeof abilities];
			if (!modelAbilities) continue;
			for (const slug of Object.keys(modelAbilities).sort()) {
				const ability = modelAbilities[slug as CRUDOperations];
				if (!ability) continue;
				manifestAbilities.push({
					expression: ability.expression?.toString() ?? null,
					model,
					operation: ability.operation,
					policyName: this.createAbilityName(model, slug),
					slug,
				});
			}
		}

		const manifestRoles = Object.keys(roles)
			.sort()
			.map((roleName) => {
				const roleAbilities = roles[roleName];
				const grants: string[] | "*" = Array.isArray(roleAbilities)
					? roleAbilities.map((ability) => {
							if (!ability.model || !ability.slug) {
								throw new Error(
									`Ability for role ${roleName} is missing model or slug`,
								);
							}
							return this.createAbilityName(ability.model, ability.slug);
					  })
					: "*";

				return { grants, roleName };
			});

		return {
			abilities: manifestAbilities,
			databaseScope: this.getDatabaseScope(),
			roles: manifestRoles,
		};
	};

	getSetupManifestId = () => `${this.getDatabaseScope()}:public`;

	getStoredSetupManifestHash = async (
		manifestId: string,
		prisma: PrismaExecutor = this.prisma,
	) => {
		try {
			const rows = await prisma.$queryRawUnsafe<PgYatesSchemaSync[]>(
				`
					SELECT manifest_hash
					FROM _yates._yates_schema_syncs
					WHERE id = $1
					LIMIT 1;
				`,
				manifestId,
			);

			return rows[0]?.manifest_hash ?? null;
		} catch (error) {
			if (isMissingYatesSchemaError(error)) {
				return null;
			}
			throw error;
		}
	};

	upsertSetupManifestHash = (
		manifestId: string,
		manifestHash: string,
		prisma: PrismaExecutor = this.prisma,
		metadata: SetupMetadata = {},
	) =>
		prisma.$executeRawUnsafe(
			`
				INSERT INTO _yates._yates_schema_syncs (id, manifest_hash, manifest_version, yates_version, app_name, app_version, app_revision, applied_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7, now())
				ON CONFLICT (id) DO UPDATE
				SET manifest_hash = EXCLUDED.manifest_hash,
					manifest_version = EXCLUDED.manifest_version,
					yates_version = EXCLUDED.yates_version,
					app_name = EXCLUDED.app_name,
					app_version = EXCLUDED.app_version,
					app_revision = EXCLUDED.app_revision,
					applied_at = now();
			`,
			manifestId,
			manifestHash,
			SETUP_MANIFEST_VERSION,
			YATES_VERSION,
			metadata.appName ?? "yates",
			metadata.appVersion ?? null,
			metadata.appRevision ?? null,
		);

	getDefaultAbilities = (models: Models[]) => {
		const abilities: Partial<DefaultAbilities> = {};
		for (const model of models) {
			abilities[model] = {
				create: {
					description: `Create ${model}`,
					expression: "true",
					operation: "INSERT",
					model: model as any,
					slug: "create",
				},
				read: {
					description: `Read ${model}`,
					expression: "true",
					operation: "SELECT",
					model: model as any,
					slug: "read",
				},
				update: {
					description: `Update ${model}`,
					expression: "true",
					operation: "UPDATE",
					model: model as any,
					slug: "update",
				},
				delete: {
					description: `Delete ${model}`,
					expression: "true",
					operation: "DELETE",
					model: model as any,
					slug: "delete",
				},
			};
		}
		return abilities;
	};

	// @ts-ignore
	getBatchId(query: any): string | undefined {
		if (query.action !== "findUnique" && query.action !== "findUniqueOrThrow") {
			return undefined;
		}
		const parts: string[] = [];
		if (query.modelName) {
			parts.push(query.modelName);
		}

		if (query.query.arguments) {
			parts.push(this.buildKeysString(query.query.arguments));
		}
		parts.push(this.buildKeysString(query.query.selection));

		return parts.join("");
	}

	buildKeysString(obj: object): string {
		const keysArray = Object.keys(obj)
			.sort()
			.map((key) => {
				// @ts-ignore
				const value = obj[key];
				if (typeof value === "object" && value !== null) {
					return `(${key} ${this.buildKeysString(value)})`;
				}
				return key;
			});

		return `(${keysArray.join(" ")})`;
	}

	// This uses client extensions to set the role and context for the current user so that RLS can be applied
	createClient = (getContext: GetContextFn, options: ClientOptions = {}) => {
		const prisma = this.prisma;
		// Set default options
		const { txMaxWait = 30000, txTimeout = 30000 } = options;

		// By default, Prisma will batch requests by the transaction ID if it is present.
		// This behaviour prevents automatic batching from working when using Yates, since all queries are executed inside an interactive transaction.
		// To get around this we by monkey patching the batching function to use the Yates ID as the batch ID.
		// To get the batching to work we also need to ensure that all the requests we might want to batch together are generated inside the same tick.
		// This means that all the requests per-tick that have the same role and context values will be batched together,
		// allowing the in-built prisma batch optimizations to work for us.
		// This is why we use process.nextTick and the tickActive flag to ensure we only tick once at a time.
		// See:
		// - https://github.com/prisma/prisma/blob/5.21.1/packages/client/src/runtime/RequestHandler.ts#L122
		// - https://www.prisma.io/docs/orm/prisma-client/queries/query-optimization-performance
		(prisma as any)._requestHandler.dataloader.options.batchBy = (
			request: any,
		) => {
			const batchIdPQ = this.getBatchId(request.protocolQuery);

			if (request.transaction?.id) {
				return `transaction-${request.transaction.id}${
					batchIdPQ ? `-${batchIdPQ}` : ""
				}`;
			}

			return this.getBatchId(request.protocolQuery);
		};

		let tickActive = false;
		const batches: Record<string, Batch> = {};

		// This function is called once per tick, and processes all the batches that have been created during that tick.
		// Each batch represents a unique role + context combination, and contains all the requests that need to be executed with that role + context.
		const dispatchBatches = () => {
			for (const [key, batch] of Object.entries(batches)) {
				delete batches[key];

				// Because batch transactions inside a prisma client query extension can run out of order if used with async middleware,
				// we need to run the logic inside an interactive transaction, however this brings a different set of problems in that the
				// main query will no longer automatically run inside the transaction. We resolve this issue by manually executing the prisma request.
				// See https://github.com/prisma/prisma/issues/18276
				prisma
					.$transaction(
						async (tx) => {
							// Switch to the user role, We can't use a prepared statement here, due to limitations in PG not allowing prepared statements to be used in SET LOCAL ROLE
							await tx.$queryRawUnsafe(`SET LOCAL ROLE ${batch.pgRole}`);
							// Now set all the context variables using `set_config` so that they can be used in RLS
							for (const [key, value] of toPairs(batch.context)) {
								await tx.$queryRaw`SELECT set_config(${key}, ${value.toString()}, true);`;
							}

							// Inconveniently, the `query` function will not run inside an interactive transaction.
							// We need to manually reconstruct the query, and attached the "secret" transaction ID.
							// This ensures that the query will run inside the transaction AND that middlewares will not be re-applied

							// https://github.com/prisma/prisma/blob/4.11.0/packages/client/src/runtime/getPrismaClient.ts#L1013
							// This is a private API, so not much we can do about the typing here
							const txId = (tx as any)[
								Symbol.for("prisma.client.transaction.id")
							];
							const results = await Promise.all(
								batch.requests.map((request) =>
									prisma._executeRequest({
										...request.params,
										transaction: {
											kind: "itx",
											id: txId,
										},
									}),
								),
							);

							return results;
						},
						{
							maxWait: txMaxWait,
							timeout: txTimeout,
						},
					)
					.then((results) => {
						results.forEach((result, index) => {
							batch.requests[index].resolve(result);
						});
					})
					.catch((e) => {
						for (const request of batch.requests) {
							request.reject(e);
						}
						delete batches[key];
					});
			}
		};

		const createRoleName = this.createRoleName.bind(this);

		const client = prisma.$extends({
			name: "Yates client",
			query: {
				$allModels: {
					async $allOperations(params) {
						const { model, args, query, operation } = params;
						if (!model) {
							// If the model is not defined, we can't apply RLS
							// This can occur when you are making a call with Prisma's $queryRaw method
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

						// Create a unique hash for the role + context combination
						const txId = hashWithPrefix("yates_tx_", JSON.stringify(ctx));

						const hash = txId;
						if (!batches[hash]) {
							// Create a new batch for this role + context combination
							batches[hash] = {
								pgRole,
								context,
								requests: [],
							};

							// make sure, that we only tick once at a time
							if (!tickActive) {
								tickActive = true;
								process.nextTick(() => {
									dispatchBatches();
									tickActive = false;
								});
							}
						}

						// See https://github.com/prisma/prisma/blob/4.11.0/packages/client/src/runtime/getPrismaClient.ts#L860
						// This is a private API, so not much we can do about the cast
						const __internalParams = (params as any).__internalParams;

						// Add the request to the batch, and return a promise that will be resolved or rejected in dispatchBatches
						return new Promise((resolve, reject) => {
							batches[hash].requests.push({
								params: __internalParams,
								query,
								args,
								resolve,
								reject,
							});
						}).catch((e) => {
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
						});
					},
				},
			},
		});

		return client;
	};

	setRLS = async <ContextKeys extends string, YModel extends Models>(
		prisma: PrismaExecutor,
		table: string,
		roleName: string,
		slug: string,
		ability: Ability<ContextKeys, YModel>,
		resolvedExpression: ResolvedSetupAbilityExpression,
	) => {
		const { operation, expression: rawExpression, description } = ability;
		if (!rawExpression) {
			throw new Error("Expression must be defined for RLS abilities");
		}
		const { abilityExpression, policyExpression } = resolvedExpression;

		// The caller holds the setup transaction lock, so keep this work on the
		// caller's transaction client instead of opening a nested transaction.
		const policyName = roleName;
		const quotedPolicyName = this.quoteIdentifier(policyName);
		const quotedRoleName = this.quoteIdentifier(roleName);
		const quotedTableName = `${this.quoteIdentifier(
			"public",
		)}.${this.quoteIdentifier(table)}`;
		const existingAbilities: PgYatesAbility[] = await prisma.$queryRaw`
				select * from _yates._yates_abilities where ability_model = ${table} and ability_policy_name = ${policyName}
			`;
		const existingAbility = existingAbilities[0];
		const existingPolicies: PgPolicy[] = await prisma.$queryRaw`
			select policyname, tablename, cmd, qual, with_check
			from pg_catalog.pg_policies
			where schemaname = 'public'
				and tablename = ${table}
				and policyname = ${policyName}
		`;
		const existingPolicy = existingPolicies[0];

		const shouldCreatePolicy = !existingPolicy;
		const shouldAlterPolicy =
			Boolean(existingPolicy) &&
			(!existingAbility ||
				existingAbility.ability_expression !== abilityExpression);
		const shouldUpdateAbilityTable =
			shouldCreatePolicy ||
			!existingAbility ||
			existingAbility.ability_expression !== abilityExpression;

		if (shouldCreatePolicy) {
			debug(
				existingAbility
					? "Recreating missing RLS policy for"
					: "Creating RLS policy for",
				roleName,
				"on",
				table,
				"for",
				operation,
			);

			if (operation === "INSERT") {
				await prisma.$queryRawUnsafe(`
					CREATE POLICY ${quotedPolicyName} ON ${quotedTableName} FOR ${operation} TO ${quotedRoleName} WITH CHECK (${policyExpression});
				`);
			} else {
				await prisma.$queryRawUnsafe(`
					CREATE POLICY ${quotedPolicyName} ON ${quotedTableName} FOR ${operation} TO ${quotedRoleName} USING (${policyExpression});
				`);
			}
		} else if (shouldAlterPolicy) {
			debug("Updating RLS policy for", roleName, "on", table, "for", operation);
			if (operation === "INSERT") {
				await prisma.$queryRawUnsafe(`
					ALTER POLICY ${quotedPolicyName} ON ${quotedTableName} TO ${quotedRoleName} WITH CHECK (${policyExpression});
				`);
			} else {
				await prisma.$queryRawUnsafe(`
					ALTER POLICY ${quotedPolicyName} ON ${quotedTableName} TO ${quotedRoleName} USING (${policyExpression});
				`);
			}
		}

		if (shouldUpdateAbilityTable) {
			await upsertAbility(prisma, {
				ability_model: table,
				ability_name: slug,
				ability_policy_name: policyName,
				ability_description: description ?? "",
				ability_operation: operation,
				// We store the string representation of the expression so that
				// we can compare it later without having to recompute the SQL
				ability_expression: abilityExpression,
			});
		}
	};

	prepareSetup = async <
		ContextKeys extends string,
		YModels extends Models,
		K extends CustomAbilities = CustomAbilities,
		T = DefaultAbilities<ContextKeys, YModels> & K,
	>({
		customAbilities,
		getRoles,
	}: {
		customAbilities?: Partial<K>;
		getRoles: (abilities: T) => {
			[role: string]: AllAbilities<ContextKeys, YModels>[] | "*";
		};
	}) => {
		await this.ensureDatabaseScope();

		const runtimeDataModel = this.inspectRunTimeDataModel();
		const models = Object.keys(runtimeDataModel.models).map(
			(m) => runtimeDataModel.models[m].dbName || m,
		) as Models[];
		if (customAbilities) {
			const diff = difference(Object.keys(customAbilities), models);
			if (diff.length) {
				throw new Error(
					`Invalid models in custom abilities: ${diff.join(", ")}`,
				);
			}
		}
		const defaultAbilities = this.getDefaultAbilities(models);
		const abilities: Partial<DefaultAbilities> = cloneDeep(defaultAbilities);
		for (const model of models) {
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
						model: model as any,
						slug: ability,
					};
				}
			}
		}

		const roles = getRoles(abilities as T);
		const setupManifest = this.createSetupManifest(
			abilities,
			roles as { [role: string]: AllAbilities<string, Models>[] | "*" },
		);
		const setupManifestHash = this.createSetupManifestHash(setupManifest);
		const setupManifestId = this.getSetupManifestId();

		return {
			abilities,
			defaultAbilities,
			roles,
			setupManifest,
			setupManifestHash,
			setupManifestId,
		};
	};

	validateSetup = async <
		ContextKeys extends string,
		YModels extends Models,
		K extends CustomAbilities = CustomAbilities,
		T = DefaultAbilities<ContextKeys, YModels> & K,
	>({
		customAbilities,
		getRoles,
	}: {
		customAbilities?: Partial<K>;
		getRoles: (abilities: T) => {
			[role: string]: AllAbilities<ContextKeys, YModels>[] | "*";
		};
	}): Promise<SetupValidationResult> => {
		const { setupManifestHash, setupManifestId } = await this.prepareSetup<
			ContextKeys,
			YModels,
			K,
			T
		>({ customAbilities, getRoles });
		const storedManifestHash =
			await this.getStoredSetupManifestHash(setupManifestId);

		if (storedManifestHash !== setupManifestHash) {
			throw new YatesSetupManifestMismatchError(
				setupManifestId,
				setupManifestHash,
				storedManifestHash,
			);
		}

		return {
			actualHash: storedManifestHash,
			expectedHash: setupManifestHash,
			manifestId: setupManifestId,
		};
	};

	hasMissingSetupPolicies = async (
		setupManifest: SetupManifest,
		prisma: PrismaExecutor = this.prisma,
	) => {
		const expectedPolicies = setupManifest.abilities.filter(
			(ability) => ability.expression !== null,
		);
		if (expectedPolicies.length === 0) {
			return false;
		}

		const pgPolicies: PgPolicy[] = await prisma.$queryRawUnsafe(`
			select policyname, tablename, cmd
			from pg_catalog.pg_policies
			where schemaname = 'public'
		`);
		const existingPolicies = new Set(
			pgPolicies.map(
				(policy) => `${policy.tablename}:${policy.policyname}:${policy.cmd}`,
			),
		);

		return expectedPolicies.some(
			(ability) =>
				!existingPolicies.has(
					`${ability.model}:${ability.policyName}:${ability.operation}`,
				),
		);
	};

	resolveSetupAbilityExpressions = async (
		abilities: Partial<DefaultAbilities>,
	) => {
		const resolvedSetupAbilityExpressions: Record<
			string,
			ResolvedSetupAbilityExpression
		> = {};
		for (const model in abilities) {
			for (const slug in abilities[model as keyof typeof abilities]) {
				const ability =
					// biome-ignore lint/style/noNonNullAssertion: TODO fix this
					abilities[model as keyof typeof abilities]![slug as CRUDOperations];
				if (!ability.expression) {
					continue;
				}

				const roleName = this.createAbilityName(model, slug);
				resolvedSetupAbilityExpressions[roleName] = {
					abilityExpression: ability.expression.toString(),
					policyExpression: await expressionToSQL(
						ability.expression as any,
						model,
					),
				};
			}
		}
		return resolvedSetupAbilityExpressions;
	};

	createRoles = async <
		ContextKeys extends string,
		YModels extends Models,
		K extends CustomAbilities = CustomAbilities,
		T = DefaultAbilities<ContextKeys, YModels> & K,
	>({
		customAbilities,
		getRoles,
		metadata,
		options = {},
	}: {
		customAbilities?: Partial<K>;
		getRoles: (abilities: T) => {
			[role: string]: AllAbilities<ContextKeys, YModels>[] | "*";
		};
		metadata?: SetupMetadata;
		options?: ClientOptions;
	}) => {
		const { txMaxWait = 30000, txTimeout = 30000 } = options;
		const {
			abilities,
			defaultAbilities,
			roles,
			setupManifest,
			setupManifestHash,
			setupManifestId,
		} = await this.prepareSetup<ContextKeys, YModels, K, T>({
			customAbilities,
			getRoles,
		});

		const storedManifestHash =
			await this.getStoredSetupManifestHash(setupManifestId);
		const manifestIsCurrent = storedManifestHash === setupManifestHash;
		const hasMissingPolicies =
			manifestIsCurrent && (await this.hasMissingSetupPolicies(setupManifest));

		if (manifestIsCurrent && !hasMissingPolicies) {
			debug("Yates setup manifest unchanged; skipping role reconciliation");
			return;
		}
		if (hasMissingPolicies) {
			debug(
				"Yates setup manifest is current but policies are missing; reconciling role state",
			);
		}

		const resolvedSetupAbilityExpressions =
			await this.resolveSetupAbilityExpressions(abilities);

		await this.prisma.$transaction(
			async (tx) => {
				const prisma = tx as PrismaExecutor;
				await takeLock(prisma);

				const storedManifestHash = await this.getStoredSetupManifestHash(
					setupManifestId,
					prisma,
				);
				const manifestIsCurrent = storedManifestHash === setupManifestHash;
				const hasMissingPolicies =
					manifestIsCurrent &&
					(await this.hasMissingSetupPolicies(setupManifest, prisma));

				if (manifestIsCurrent && !hasMissingPolicies) {
					debug(
						"Yates setup manifest unchanged after acquiring lock; skipping role reconciliation",
					);
					return;
				}

				await this.reconcileRoles({
					abilities,
					defaultAbilities,
					prisma,
					resolvedSetupAbilityExpressions,
					roles,
				});
				await this.upsertSetupManifestHash(
					setupManifestId,
					setupManifestHash,
					prisma,
					metadata,
				);
			},
			{ maxWait: txMaxWait, timeout: txTimeout },
		);
	};

	reconcileRoles = async <ContextKeys extends string, YModels extends Models>({
		abilities,
		defaultAbilities,
		prisma,
		resolvedSetupAbilityExpressions,
		roles,
	}: {
		abilities: Partial<DefaultAbilities>;
		defaultAbilities: Partial<DefaultAbilities>;
		prisma: PrismaExecutor;
		resolvedSetupAbilityExpressions: Record<
			string,
			ResolvedSetupAbilityExpression
		>;
		roles: {
			[role: string]: AllAbilities<ContextKeys, YModels>[] | "*";
		};
	}) => {
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

				for (const migratedAbility of migratedAbilities) {
					await upsertAbility(prisma, migratedAbility);
				}

				existingAbilities.push(...(migratedAbilities as PgYatesAbility[]));
			}
		}

		// For each of the models and abilities, create a role and a corresponding RLS policy
		// We can then mix & match these roles to create a user's permissions by granting them to a user role (like SUPER_ADMIN)
		for (const model in abilities) {
			const table = model;

			await this.enableRowLevelSecurityIfNeeded(prisma, table);

			for (const slug in abilities[model as keyof typeof abilities]) {
				const ability =
					// biome-ignore lint/style/noNonNullAssertion: TODO fix this
					abilities[model as keyof typeof abilities]![slug as CRUDOperations];

				if (!VALID_OPERATIONS.includes(ability.operation)) {
					throw new Error(`Invalid operation: ${ability.operation}`);
				}

				const roleName = this.createAbilityName(model, slug);

				// Check if role already exists
				if (
					pgRoles.find((role: { rolname: string }) => role.rolname === roleName)
				) {
					debug("Role already exists", roleName, model, slug);
				} else {
					await prisma.$executeRawUnsafe(`
						do
						$$
						begin
						if not exists (select * from pg_catalog.pg_roles where rolname = '${roleName}') then 
							create role ${roleName};
						end if;
						end
						$$
						;
					`);
					await prisma.$executeRawUnsafe(`
						GRANT ${ability.operation} ON ${this.quoteIdentifier(
							"public",
						)}.${this.quoteIdentifier(table)} TO ${this.quoteIdentifier(
							roleName,
						)};
					`);
				}

				if (ability.expression) {
					const resolvedExpression = resolvedSetupAbilityExpressions[roleName];
					if (!resolvedExpression) {
						throw new Error(
							`Missing resolved expression for ${model}.${slug} (${roleName})`,
						);
					}
					await this.setRLS(
						prisma,
						table,
						roleName,
						slug,
						ability as any,
						resolvedExpression,
					);
				}
			}
		}

		// For each of the given roles, create a role in the database and grant it the relevant permissions.
		// By defining each permission as a seperate role, we can GRANT them to the user role here, re-using them.
		// It's not possible to dynamically GRANT these to a shared user role, as the GRANT is not isolated per transaction and leads to broken permissions.
		for (const key in roles) {
			const role = this.createRoleName(key);
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

			const wildCardAbilities = flatMap(
				defaultAbilities,
				(model, modelName) => {
					return map(model, (_params, slug) => {
						return this.createAbilityName(modelName, slug);
					});
				},
			);
			const roleAbilities = roles[key];
			const rlsRoles =
				roleAbilities === "*"
					? wildCardAbilities
					: roleAbilities.map((ability) =>
							// biome-ignore lint/style/noNonNullAssertion: TODO fix this
							this.createAbilityName(ability.model!, ability.slug!),
					  );

			debug(
				"Setting up role",
				key,
				role,
				"with abilities",
				rlsRoles.join(", "),
			);

			// Note: We need to GRANT all on schema public so that we can resolve relation queries with prisma, as they will sometimes use a join table.
			// This is not ideal, but because we are using RLS, it's not a security risk. Any table with RLS also needs a corresponding policy for the role to have access.
			await prisma.$executeRawUnsafe(
				`GRANT ALL ON ALL TABLES IN SCHEMA public TO ${role};`,
			);
			await prisma.$executeRawUnsafe(`
					GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${role};
				`);
			await prisma.$executeRawUnsafe(`
					GRANT ALL ON SCHEMA public TO ${role};
				`);
			await prisma.$queryRawUnsafe(`GRANT ${rlsRoles.join(", ")} TO ${role}`);

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
				debug("Revoking old roles", key, role, oldRoles.join(", "));
				await prisma.$executeRawUnsafe(
					`REVOKE ${oldRoles.join(", ")} FROM ${role}`,
				);
				const policies = await prisma.$queryRawUnsafe<PgPolicy[]>(
					`SELECT * FROM pg_catalog.pg_policies WHERE policyname IN (${oldRoles
						.map((or) => `'${or}'`)
						.join(", ")})`,
				);
				for (const oldPolicy of policies) {
					await prisma.$executeRawUnsafe(
						`DROP POLICY ${oldPolicy.policyname} ON "${oldPolicy.tablename}"`,
					);
				}

				debug("Revoked old rows from ability table", oldRoles.join(", "));
				await prisma.$executeRawUnsafe(
					`DELETE FROM _yates._yates_abilities WHERE ability_policy_name IN (${oldRoles
						.map((or) => `'${or}'`)
						.join(", ")})`,
				);
			}
		}
	};

	inspectDBRoles = async (role: string) => {
		await this.ensureDatabaseScope();
		const hashedRoleName = this.createRoleName(role);

		// Load all policies for the role
		const roles = await this.prisma.$queryRawUnsafe<
			{
				tablename: string;
				policyname: string;
				cmd: string;
				policy_roles: string[];
				matched_role: string[];
			}[]
		>(`
        WITH RECURSIVE role_tree AS(
            --Start from your role
            SELECT 
                r.oid,
                    r.rolname
            FROM pg_roles r
            WHERE r.rolname = '${hashedRoleName}'

            UNION

            --Walk "upwards": all parent roles granted to it
            SELECT 
                parent.oid,
                    parent.rolname
            FROM pg_auth_members m
            JOIN role_tree rt
            ON m.member = rt.oid
            JOIN pg_roles parent
            ON parent.oid = m.roleid
                )
                SELECT
                p.tablename,
                    p.policyname,
                    p.cmd,
                    p.roles:: text[]          AS policy_roles,
                        rt.rolname                  AS matched_role
        FROM pg_policies p
        JOIN role_tree rt
                ON(
                    p.roles IS NULL
            OR array_length(p.roles, 1) = 0
            OR rt.rolname = ANY(p.roles:: text[])
                )
        WHERE p.schemaname = 'public'
        ORDER BY p.policyname, matched_role;
        `);

		return roles;
	};

	inspectRunTimeDataModel = (): RuntimeDataModel => {
		// See https://github.com/prisma/prisma/discussions/14777
		// We are reaching into the prisma internals to get the data model.
		// This is a bit sketchy, but we can get the internal type definition from the runtime library
		// and there is even a test case in prisma that checks that this value is exported
		// See https://github.com/prisma/prisma/blob/5.1.0/packages/client/tests/functional/extensions/pdp.ts#L51
		// This is a private API, so not much we can do about the cast
		const runtimeDataModel = (this.prisma as any)
			._runtimeDataModel as RuntimeDataModel;

		return runtimeDataModel;
	};
}

/**
 * Applies Yates roles, grants and row-level security policies. Run this from
 * an explicit deployment/migration step, not from normal application startup.
 **/
export const migrateYates = async <
	ContextKeys extends string = string,
	YModels extends Models = Models,
	K extends CustomAbilities<ContextKeys, YModels> = CustomAbilities<
		ContextKeys,
		YModels
	>,
>(
	params: SetupMigrationParams<ContextKeys, YModels, K>,
) => {
	const start = performance.now();

	const { prisma, customAbilities, getRoles, metadata } = params;
	const yates = new Yates(prisma);
	await yates.init();
	await yates.createRoles<ContextKeys, YModels, K>({
		customAbilities,
		getRoles,
		metadata,
		options: params.options,
	});

	debug("Migration completed in", performance.now() - start, "ms");
};

/**
 * Validates that the database has already had the current Yates manifest
 * applied. This is safe for runtime startup because it does not create,
 * alter, grant, revoke or drop database authorization state.
 **/
export const validateYatesSetup = async <
	ContextKeys extends string = string,
	YModels extends Models = Models,
	K extends CustomAbilities<ContextKeys, YModels> = CustomAbilities<
		ContextKeys,
		YModels
	>,
>(
	params: SetupMigrationParams<ContextKeys, YModels, K>,
) => {
	const { prisma, customAbilities, getRoles } = params;
	const yates = new Yates(prisma);
	return yates.validateSetup<ContextKeys, YModels, K>({
		customAbilities,
		getRoles,
	});
};

/**
 * Creates an extended client that sets contextual parameters and user role on
 * every query. Unlike setup(), this validates that migration already happened
 * instead of mutating database authorization state during app startup.
 **/
export const createYatesClient = async <
	ContextKeys extends string = string,
	YModels extends Models = Models,
	K extends CustomAbilities<ContextKeys, YModels> = CustomAbilities<
		ContextKeys,
		YModels
	>,
>(
	params: SetupParams<ContextKeys, YModels, K>,
) => {
	const { prisma, customAbilities, getRoles, getContext } = params;
	const yates = new Yates(prisma);
	await yates.validateSetup<ContextKeys, YModels, K>({
		customAbilities,
		getRoles,
	});
	const client = yates.createClient(getContext, params.options);

	return client;
};

/**
 * Creates an extended client that sets contextual parameters and user role on every query.
 *
 * This remains backwards compatible: it applies/migrates Yates database state
 * before returning the runtime client. For application startup, prefer running
 * migrateYates() in an explicit deploy step and createYatesClient() at runtime.
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

	await migrateYates(params);
	const { prisma, getContext } = params;
	const yates = new Yates(prisma);
	await yates.ensureDatabaseScope();
	const client = yates.createClient(getContext, params.options);

	debug("Setup completed in", performance.now() - start, "ms");

	return client;
};
