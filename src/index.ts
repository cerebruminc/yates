import { Prisma, PrismaClient } from "@prisma/client";
import logger from "debug";
import cloneDeep from "lodash/cloneDeep";
import difference from "lodash/difference";
import {
	Expression,
	ExpressionContext,
	ExpressionRow,
	RuntimeDataModel,
} from "./expressions";

const VALID_OPERATIONS = ["SELECT", "UPDATE", "INSERT", "DELETE"] as const;

const debug = logger("yates");

type Operation = (typeof VALID_OPERATIONS)[number];
export type Models = Prisma.ModelName;

interface ClientOptions {
	/** Unused in query-based permissions, kept for backwards compatibility. */
	txMaxWait?: number;
	/** Unused in query-based permissions, kept for backwards compatibility. */
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
	 * Returning `null` will result in the permissions being skipped entirely.
	 */
	getContext: GetContextFn<ContextKeys>;
	options?: ClientOptions;
}

// Sanitize a single string by ensuring the it has only lowercase alpha characters and underscores
export const sanitizeSlug = (slug: string) =>
	slug
		.toLowerCase()
		.replace(/-/g, "_")
		.replace(/[^a-z0-9_]/gi, "");

const OPERATION_MAP: Record<string, Operation> = {
	findUnique: "SELECT",
	findUniqueOrThrow: "SELECT",
	findFirst: "SELECT",
	findFirstOrThrow: "SELECT",
	findMany: "SELECT",
	count: "SELECT",
	aggregate: "SELECT",
	groupBy: "SELECT",
	create: "INSERT",
	createMany: "INSERT",
	update: "UPDATE",
	updateMany: "UPDATE",
	delete: "DELETE",
	deleteMany: "DELETE",
	upsert: "UPDATE",
};

const UNIQUE_OPERATIONS = new Set([
	"findUnique",
	"findUniqueOrThrow",
	"update",
	"delete",
	"upsert",
]);

const SELECT_OPERATIONS = new Set([
	"findUnique",
	"findUniqueOrThrow",
	"findFirst",
	"findFirstOrThrow",
	"findMany",
	"count",
	"aggregate",
	"groupBy",
]);

const isPlainObject = (value: unknown): value is Record<string, any> =>
	!!value && typeof value === "object" && !Array.isArray(value);

const lowerModelName = (model: string) =>
	model.length ? `${model[0].toLowerCase()}${model.slice(1)}` : model;

const isFieldRef = (
	value: unknown,
): value is Prisma.FieldRef<string, unknown> =>
	isPlainObject(value) &&
	typeof (value as any).modelName === "string" &&
	typeof (value as any).name === "string";

const isEmptyWhere = (where?: Record<string, any> | null) =>
	!where || (isPlainObject(where) && Object.keys(where).length === 0);

const combineAbilityFilters = (filters: Record<string, any>[]) => {
	if (filters.length === 0) return null;
	if (filters.some((filter) => isEmptyWhere(filter))) return {};
	if (filters.length === 1) return filters[0];
	return { OR: filters };
};

const mergeWhere = (
	base: Record<string, any> | undefined,
	extra: Record<string, any> | null,
) => {
	if (!extra || isEmptyWhere(extra)) return base ?? extra ?? undefined;
	if (!base || isEmptyWhere(base)) return extra;
	return { AND: [base, extra] };
};

const getFluentSelectionField = (
	runtimeDataModel: RuntimeDataModel,
	model: string,
	args: Record<string, any>,
) => {
	const selection = args.select;
	if (!isPlainObject(selection)) return null;
	const keys = Object.keys(selection);
	if (keys.length !== 1) return null;
	const field = keys[0];
	const modelData = runtimeDataModel.models[model];
	const fieldData = modelData?.fields.find((f: any) => f.name === field);
	if (!fieldData || fieldData.kind !== "object") return null;
	return field;
};

const getIdField = (
	runtimeDataModel: RuntimeDataModel,
	model: string,
): string | null => {
	const modelData = runtimeDataModel.models[model];
	if (!modelData) return null;
	const idField = modelData.fields.find((field: any) => field.isId);
	return idField?.name ?? null;
};

const denyWhere = (
	runtimeDataModel: RuntimeDataModel,
	model: string,
): Record<string, any> => {
	const idField = getIdField(runtimeDataModel, model);
	if (idField) {
		return {
			[idField]: {
				in: [],
			},
		};
	}
	return {
		AND: [{ __yates_deny__: true }],
	};
};

const validateContext = (context: Record<string, any> | undefined) => {
	if (!context) return;
	for (const key of Object.keys(context)) {
		if (!key.match(/^[a-z_\.]+$/)) {
			throw new Error(
				`Context variable "${key}" contains invalid characters. Context variables must only contain lowercase letters, numbers, periods and underscores.`,
			);
		}
		const value = context[key];
		if (
			typeof value !== "number" &&
			typeof value !== "string" &&
			!Array.isArray(value)
		) {
			throw new Error(
				`Context variable "${key}" must be a string, number or array. Got ${typeof value}`,
			);
		}
		if (Array.isArray(value)) {
			for (const entry of value as unknown[]) {
				if (typeof entry !== "string") {
					throw new Error(
						`Context variable "${key}" must be an array of strings. Got ${typeof entry}`,
					);
				}
			}
		}
	}
};

const permissionError = (model: string, operation: string) =>
	new Error(
		`You do not have permission to perform this action: ${model}.${operation}(...)`,
	);

const updateNotFoundError = () => new Error("Record to update not found");
const deleteNotFoundError = () => new Error("Record to delete does not exist");

const matchesScalarFilter = (
	value: any,
	filter: any,
	data: Record<string, any>,
): boolean => {
	if (!isPlainObject(filter)) {
		if (isFieldRef(filter)) {
			return value === data[filter.name];
		}
		return value === filter;
	}
	if ("equals" in filter) {
		const target = filter.equals;
		if (isFieldRef(target)) {
			return value === data[target.name];
		}
		return value === target;
	}
	if ("in" in filter) {
		return Array.isArray(filter.in) && filter.in.includes(value);
	}
	if ("notIn" in filter) {
		return Array.isArray(filter.notIn) && !filter.notIn.includes(value);
	}
	if ("lt" in filter) return value < filter.lt;
	if ("lte" in filter) return value <= filter.lte;
	if ("gt" in filter) return value > filter.gt;
	if ("gte" in filter) return value >= filter.gte;
	if ("contains" in filter)
		return typeof value === "string" && value.includes(filter.contains);
	if ("startsWith" in filter)
		return typeof value === "string" && value.startsWith(filter.startsWith);
	if ("endsWith" in filter)
		return typeof value === "string" && value.endsWith(filter.endsWith);
	if ("not" in filter) return !matchesScalarFilter(value, filter.not, data);
	return value === filter;
};

const matchesWhere = (
	runtimeDataModel: RuntimeDataModel,
	model: string,
	data: Record<string, any>,
	where: Record<string, any>,
): boolean => {
	if (where.AND) {
		const clauses = Array.isArray(where.AND) ? where.AND : [where.AND];
		if (
			!clauses.every((clause) =>
				matchesWhere(runtimeDataModel, model, data, clause),
			)
		) {
			return false;
		}
	}
	if (where.OR) {
		const clauses = Array.isArray(where.OR) ? where.OR : [where.OR];
		if (
			!clauses.some((clause) =>
				matchesWhere(runtimeDataModel, model, data, clause),
			)
		) {
			return false;
		}
	}
	if (where.NOT) {
		const clauses = Array.isArray(where.NOT) ? where.NOT : [where.NOT];
		if (
			clauses.some((clause) =>
				matchesWhere(runtimeDataModel, model, data, clause),
			)
		) {
			return false;
		}
	}
	for (const [field, condition] of Object.entries(where)) {
		if (field === "AND" || field === "OR" || field === "NOT") continue;
		const modelData = runtimeDataModel.models[model];
		const fieldData = modelData?.fields.find((f: any) => f.name === field);
		if (!fieldData) continue;
		if (fieldData.kind === "object") {
			throw new Error(
				`Relation filters are not supported in create checks for ${model}.${field}.`,
			);
		}
		const value = data[field];
		if (!matchesScalarFilter(value, condition, data)) return false;
	}
	return true;
};

const extractModelFields = (
	runtimeDataModel: RuntimeDataModel,
	model: string,
) => {
	const modelData = runtimeDataModel.models[model];
	return modelData?.fields ?? [];
};

const buildRowHelper = <M extends Models>(
	prisma: PrismaClient,
	runtimeDataModel: RuntimeDataModel,
	model: M,
): ExpressionRow<M> => {
	return ((col: string) => {
		const modelData = runtimeDataModel.models[model];
		if (!modelData) {
			throw new Error(`Could not retrieve model data for '${model}'`);
		}
		const fieldData = modelData.fields.find((field: any) => field.name === col);
		if (!fieldData) {
			throw new Error(
				`Could not retrieve field data from Prisma Client for field '${model}.${col}'`,
			);
		}
		const delegate = (prisma as any)[lowerModelName(model)];
		const fieldRef = delegate?.fields?.[col];
		if (!fieldRef) {
			throw new Error(
				`Could not resolve field reference for '${model}.${col}'`,
			);
		}
		return fieldRef;
	}) as ExpressionRow<M>;
};

const buildContextHelper = <ContextKeys extends string>(
	context?: Record<string, string | number | string[]>,
): ExpressionContext<ContextKeys> => {
	return ((key: ContextKeys) =>
		context ? context[key] : undefined) as ExpressionContext<ContextKeys>;
};

const resolveExpression = async <ContextKeys extends string, M extends Models>(
	prisma: PrismaClient,
	runtimeDataModel: RuntimeDataModel,
	model: M,
	expression?: Expression<ContextKeys, M>,
	context?: Record<string, string | number | string[]>,
): Promise<Record<string, any>> => {
	if (!expression) return {};
	if (typeof expression !== "function")
		return expression as Record<string, any>;
	const row = buildRowHelper(prisma, runtimeDataModel, model);
	const ctx = buildContextHelper<ContextKeys>(context);
	return (await expression(prisma, row, ctx)) as Record<string, any>;
};

type RoleAbilitiesMap = Record<string, Ability<any, any>[]>;

const buildRoleAbilities = <ContextKeys extends string, YModels extends Models>(
	roles: { [role: string]: AllAbilities<ContextKeys, YModels>[] | "*" },
	allAbilities: Ability<ContextKeys, YModels>[],
): RoleAbilitiesMap => {
	const roleAbilities: RoleAbilitiesMap = {};
	for (const [role, abilities] of Object.entries(roles)) {
		roleAbilities[role] =
			abilities === "*"
				? (allAbilities as unknown as Ability<any, any>[])
				: (abilities as unknown as Ability<any, any>[]);
	}
	return roleAbilities;
};

const getAbilityFilters = async <M extends Models>(
	prisma: PrismaClient,
	runtimeDataModel: RuntimeDataModel,
	roleAbilities: RoleAbilitiesMap,
	role: string,
	model: M,
	operation: Operation,
	context?: Record<string, string | number | string[]>,
): Promise<Record<string, any>[] | null> => {
	const abilities = roleAbilities[role] || [];
	const relevant = abilities.filter(
		(ability) => ability.model === model && ability.operation === operation,
	);
	if (relevant.length === 0) {
		return [];
	}
	return Promise.all(
		relevant.map((ability) =>
			resolveExpression(
				prisma,
				runtimeDataModel,
				model,
				ability.expression as any,
				context,
			),
		),
	);
};

const applyReadSelections = async (
	prisma: PrismaClient,
	runtimeDataModel: RuntimeDataModel,
	roleAbilities: RoleAbilitiesMap,
	role: string,
	model: string,
	args: Record<string, any>,
	context?: Record<string, string | number | string[]>,
) => {
	for (const key of ["include", "select"]) {
		const selection = args[key];
		if (!selection || !isPlainObject(selection)) continue;
		for (const [field, value] of Object.entries(selection)) {
			const fields = extractModelFields(runtimeDataModel, model);
			const fieldMeta = fields.find((f: any) => f.name === field);
			if (!fieldMeta || fieldMeta.kind !== "object") continue;

			const relatedModel = fieldMeta.type as string;
			const abilityFilters = await getAbilityFilters(
				prisma,
				runtimeDataModel,
				roleAbilities,
				role,
				relatedModel as Models,
				"SELECT",
				context,
			);
			if (!abilityFilters || abilityFilters.length === 0) {
				selection[field] = false;
				continue;
			}

			const abilityWhere = combineAbilityFilters(abilityFilters);
			const nextArgs =
				value === true ? {} : { ...(value as Record<string, any>) };

			if (fieldMeta.isList) {
				nextArgs.where =
					mergeWhere(nextArgs.where, abilityWhere) ?? nextArgs.where;
			}

			await applyReadSelections(
				prisma,
				runtimeDataModel,
				roleAbilities,
				role,
				relatedModel,
				nextArgs,
				context,
			);

			selection[field] = nextArgs;
		}
	}
};

const assertCreateAllowed = async (
	prisma: PrismaClient,
	runtimeDataModel: RuntimeDataModel,
	roleAbilities: RoleAbilitiesMap,
	role: string,
	model: string,
	data: Record<string, any>,
	context?: Record<string, string | number | string[]>,
) => {
	const abilityFilters =
		(await getAbilityFilters(
			prisma,
			runtimeDataModel,
			roleAbilities,
			role,
			model as Models,
			"INSERT",
			context,
		)) ?? [];
	const abilityWhere = combineAbilityFilters(abilityFilters);
	if (!abilityWhere) {
		throw permissionError(model, "create");
	}
	if (isEmptyWhere(abilityWhere)) return;
	if (!matchesWhere(runtimeDataModel, model, data, abilityWhere)) {
		throw permissionError(model, "create");
	}
};

const assertRecordAllowed = async (
	prisma: PrismaClient,
	runtimeDataModel: RuntimeDataModel,
	roleAbilities: RoleAbilitiesMap,
	role: string,
	model: string,
	operation: Operation,
	where: Record<string, any>,
	context?: Record<string, string | number | string[]>,
): Promise<boolean> => {
	const abilityFilters =
		(await getAbilityFilters(
			prisma,
			runtimeDataModel,
			roleAbilities,
			role,
			model as Models,
			operation,
			context,
		)) ?? [];
	const abilityWhere = combineAbilityFilters(abilityFilters);
	if (!abilityWhere) {
		return false;
	}
	const combinedWhere = mergeWhere(where, abilityWhere) ?? where;
	const delegate = (prisma as any)[lowerModelName(model)];
	const record = await delegate.findFirst({
		where: combinedWhere,
		select: { [getIdField(runtimeDataModel, model) ?? "id"]: true },
	});
	return !!record;
};

const applyNestedWrites = async (
	prisma: PrismaClient,
	runtimeDataModel: RuntimeDataModel,
	roleAbilities: RoleAbilitiesMap,
	role: string,
	model: string,
	data: Record<string, any>,
	context?: Record<string, string | number | string[]>,
) => {
	if (!isPlainObject(data)) return;
	const fields = extractModelFields(runtimeDataModel, model);
	for (const [field, value] of Object.entries(data)) {
		const fieldMeta = fields.find((f: any) => f.name === field);
		if (!fieldMeta || fieldMeta.kind !== "object") continue;
		const relatedModel = fieldMeta.type as string;
		if (!isPlainObject(value)) continue;

		const handleCreate = async (createValue: any) => {
			const items = Array.isArray(createValue) ? createValue : [createValue];
			for (const item of items) {
				if (isPlainObject(item)) {
					await assertCreateAllowed(
						prisma,
						runtimeDataModel,
						roleAbilities,
						role,
						relatedModel,
						item,
						context,
					);
					await applyNestedWrites(
						prisma,
						runtimeDataModel,
						roleAbilities,
						role,
						relatedModel,
						item,
						context,
					);
				}
			}
		};

		const handleUpdate = async (updateValue: any) => {
			const items = Array.isArray(updateValue) ? updateValue : [updateValue];
			for (const item of items) {
				if (!isPlainObject(item)) continue;
				const where = item.where ?? {};
				const allowed = await assertRecordAllowed(
					prisma,
					runtimeDataModel,
					roleAbilities,
					role,
					relatedModel,
					"UPDATE",
					where,
					context,
				);
				if (!allowed) {
					throw updateNotFoundError();
				}
				if (item.data) {
					await applyNestedWrites(
						prisma,
						runtimeDataModel,
						roleAbilities,
						role,
						relatedModel,
						item.data,
						context,
					);
				}
			}
		};

		const handleDelete = async (deleteValue: any) => {
			const items = Array.isArray(deleteValue) ? deleteValue : [deleteValue];
			for (const item of items) {
				const where = isPlainObject(item) ? item : {};
				const allowed = await assertRecordAllowed(
					prisma,
					runtimeDataModel,
					roleAbilities,
					role,
					relatedModel,
					"DELETE",
					where,
					context,
				);
				if (!allowed) {
					throw deleteNotFoundError();
				}
			}
		};

		if (value.create) {
			await handleCreate(value.create);
		}
		if (value.createMany?.data) {
			await handleCreate(value.createMany.data);
		}
		if (value.update) {
			await handleUpdate(value.update);
		}
		if (value.updateMany) {
			const items = Array.isArray(value.updateMany)
				? value.updateMany
				: [value.updateMany];
			for (const item of items) {
				if (!isPlainObject(item)) continue;
				const filters =
					(await getAbilityFilters(
						prisma,
						runtimeDataModel,
						roleAbilities,
						role,
						relatedModel as Models,
						"UPDATE",
						context,
					)) ?? [];
				const abilityWhere = combineAbilityFilters(filters);
				if (!abilityWhere) {
					item.where = denyWhere(runtimeDataModel, relatedModel);
				} else {
					item.where = mergeWhere(item.where ?? {}, abilityWhere) ?? item.where;
				}
				if (item.data) {
					await applyNestedWrites(
						prisma,
						runtimeDataModel,
						roleAbilities,
						role,
						relatedModel,
						item.data,
						context,
					);
				}
			}
		}
		if (value.upsert) {
			const items = Array.isArray(value.upsert) ? value.upsert : [value.upsert];
			for (const item of items) {
				if (!isPlainObject(item)) continue;
				const where = item.where ?? {};
				const canUpdate = await assertRecordAllowed(
					prisma,
					runtimeDataModel,
					roleAbilities,
					role,
					relatedModel,
					"UPDATE",
					where,
					context,
				);
				if (canUpdate) {
					if (item.update) {
						await applyNestedWrites(
							prisma,
							runtimeDataModel,
							roleAbilities,
							role,
							relatedModel,
							item.update,
							context,
						);
					}
				} else {
					if (item.create) {
						await assertCreateAllowed(
							prisma,
							runtimeDataModel,
							roleAbilities,
							role,
							relatedModel,
							item.create,
							context,
						);
						await applyNestedWrites(
							prisma,
							runtimeDataModel,
							roleAbilities,
							role,
							relatedModel,
							item.create,
							context,
						);
					} else {
						throw updateNotFoundError();
					}
				}
			}
		}
		if (value.delete) {
			await handleDelete(value.delete);
		}
		if (value.deleteMany) {
			const items = Array.isArray(value.deleteMany)
				? value.deleteMany
				: [value.deleteMany];
			for (const item of items) {
				const filters =
					(await getAbilityFilters(
						prisma,
						runtimeDataModel,
						roleAbilities,
						role,
						relatedModel as Models,
						"DELETE",
						context,
					)) ?? [];
				const abilityWhere = combineAbilityFilters(filters);
				if (!abilityWhere) {
					item.where = denyWhere(runtimeDataModel, relatedModel);
				} else {
					item.where = mergeWhere(item.where ?? {}, abilityWhere) ?? item.where;
				}
			}
		}
	}
};

export class Yates {
	constructor(private prisma: PrismaClient) {}

	inspectRunTimeDataModel = (): RuntimeDataModel => {
		const runtimeDataModel = (this.prisma as any)
			._runtimeDataModel as RuntimeDataModel;
		return runtimeDataModel;
	};

	getDefaultAbilities = (models: Models[]) => {
		const abilities: Partial<DefaultAbilities> = {};
		for (const model of models) {
			abilities[model] = {
				create: {
					description: `Create ${model}`,
					expression: {},
					operation: "INSERT",
					model: model as any,
					slug: "create",
				},
				read: {
					description: `Read ${model}`,
					expression: {},
					operation: "SELECT",
					model: model as any,
					slug: "read",
				},
				update: {
					description: `Update ${model}`,
					expression: {},
					operation: "UPDATE",
					model: model as any,
					slug: "update",
				},
				delete: {
					description: `Delete ${model}`,
					expression: {},
					operation: "DELETE",
					model: model as any,
					slug: "delete",
				},
			};
		}
		return abilities;
	};
}

/**
 * Creates an extended client that applies role abilities to Prisma queries.
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
	const yates = new Yates(prisma);
	const runtimeDataModel = yates.inspectRunTimeDataModel();
	const models = Object.keys(runtimeDataModel.models).map(
		(m) => runtimeDataModel.models[m].dbName || m,
	) as Models[];

	if (customAbilities) {
		const diff = difference(Object.keys(customAbilities), models);
		if (diff.length) {
			throw new Error(`Invalid models in custom abilities: ${diff.join(", ")}`);
		}
	}

	const defaultAbilities = yates.getDefaultAbilities(models);
	const abilities: Partial<DefaultAbilities> = cloneDeep(defaultAbilities);

	for (const model of models) {
		const modelCustomAbilities =
			customAbilities?.[model as keyof typeof customAbilities];
		if (modelCustomAbilities) {
			if (!abilities[model]) {
				abilities[model] = {} as any;
			}
			const modelAbilities = abilities[model] as Record<string, any>;
			for (const ability in modelCustomAbilities) {
				const operation = (modelCustomAbilities as any)?.[
					ability as CRUDOperations
				]?.operation;
				if (!operation) continue;
				if (!VALID_OPERATIONS.includes(operation as Operation)) {
					throw new Error(`Invalid operation: ${operation}`);
				}
				modelAbilities[ability as CRUDOperations] = {
					...(modelCustomAbilities as any)[ability],
					operation,
					model: model as any,
					slug: ability,
				};
			}
		}
	}

	const roles = getRoles(
		abilities as DefaultAbilities<ContextKeys, YModels> & K,
	);
	const allAbilities = Object.values(abilities).flatMap((modelAbilities) =>
		modelAbilities ? Object.values(modelAbilities) : [],
	) as Ability<ContextKeys, YModels>[];

	const roleAbilities = buildRoleAbilities(roles, allAbilities);

	const client = prisma.$extends({
		name: "Yates client",
		query: {
			$allModels: {
				async $allOperations(params) {
					const { model, args, query, operation } = params;
					const queryArgs = args as any;
					if (!model) {
						return (query as any)(args);
					}

					const ctx = getContext();
					if (ctx === null) {
						return query(args);
					}

					validateContext(ctx?.context as Record<string, any> | undefined);

					const op = OPERATION_MAP[operation];
					if (!op) {
						return query(args);
					}

					const context = ctx?.context as
						| Record<string, string | number | string[]>
						| undefined;
					const role = ctx?.role;

					if (SELECT_OPERATIONS.has(operation)) {
						const filters =
							(await getAbilityFilters(
								prisma,
								runtimeDataModel,
								roleAbilities,
								role,
								model as Models,
								"SELECT",
								context,
							)) ?? [];
						const abilityWhere = combineAbilityFilters(filters);
						const combinedWhere = mergeWhere(queryArgs.where, abilityWhere);

						if (!abilityWhere) {
							const deniedWhere = denyWhere(runtimeDataModel, model);
							if (
								operation === "findUnique" ||
								operation === "findUniqueOrThrow"
							) {
								await applyReadSelections(
									prisma,
									runtimeDataModel,
									roleAbilities,
									role,
									model,
									queryArgs,
									context,
								);
								const fluentField = getFluentSelectionField(
									runtimeDataModel,
									model,
									queryArgs,
								);
								const delegate = (prisma as any)[lowerModelName(model)];
								const result =
									operation === "findUnique"
										? await delegate.findFirst({
												...queryArgs,
												where: deniedWhere,
										  })
										: await delegate.findFirstOrThrow({
												...queryArgs,
												where: deniedWhere,
										  });
								if (fluentField && result) {
									return result[fluentField];
								}
								return result;
							}
							queryArgs.where =
								mergeWhere(queryArgs.where ?? {}, deniedWhere) ??
								queryArgs.where;
							await applyReadSelections(
								prisma,
								runtimeDataModel,
								roleAbilities,
								role,
								model,
								queryArgs,
								context,
							);
							return query(args);
						}

						if (
							operation === "findUnique" ||
							operation === "findUniqueOrThrow"
						) {
							await applyReadSelections(
								prisma,
								runtimeDataModel,
								roleAbilities,
								role,
								model,
								queryArgs,
								context,
							);
							const fluentField = getFluentSelectionField(
								runtimeDataModel,
								model,
								queryArgs,
							);
							const delegate = (prisma as any)[lowerModelName(model)];
							const result =
								operation === "findUnique"
									? await delegate.findFirst({
											...queryArgs,
											where: combinedWhere,
									  })
									: await delegate.findFirstOrThrow({
											...queryArgs,
											where: combinedWhere,
									  });
							if (fluentField && result) {
								return result[fluentField];
							}
							return result;
						}

						queryArgs.where = combinedWhere ?? queryArgs.where;
						await applyReadSelections(
							prisma,
							runtimeDataModel,
							roleAbilities,
							role,
							model,
							queryArgs,
							context,
						);
						return query(args);
					}

					if (op === "INSERT") {
						if (operation === "create") {
							await assertCreateAllowed(
								prisma,
								runtimeDataModel,
								roleAbilities,
								role,
								model,
								queryArgs.data,
								context,
							);
							await applyNestedWrites(
								prisma,
								runtimeDataModel,
								roleAbilities,
								role,
								model,
								queryArgs.data,
								context,
							);
							return query(args);
						}
						if (operation === "createMany") {
							const items = Array.isArray(queryArgs.data)
								? queryArgs.data
								: [queryArgs.data];
							for (const item of items) {
								await assertCreateAllowed(
									prisma,
									runtimeDataModel,
									roleAbilities,
									role,
									model,
									item,
									context,
								);
								await applyNestedWrites(
									prisma,
									runtimeDataModel,
									roleAbilities,
									role,
									model,
									item,
									context,
								);
							}
							return query(args);
						}
					}

					if (op === "UPDATE") {
						if (operation === "update") {
							const allowed = await assertRecordAllowed(
								prisma,
								runtimeDataModel,
								roleAbilities,
								role,
								model,
								"UPDATE",
								queryArgs.where,
								context,
							);
							if (!allowed) throw updateNotFoundError();
							if (queryArgs.data) {
								await applyNestedWrites(
									prisma,
									runtimeDataModel,
									roleAbilities,
									role,
									model,
									queryArgs.data,
									context,
								);
							}
							return query(args);
						}
						if (operation === "updateMany") {
							const filters =
								(await getAbilityFilters(
									prisma,
									runtimeDataModel,
									roleAbilities,
									role,
									model as Models,
									"UPDATE",
									context,
								)) ?? [];
							const abilityWhere = combineAbilityFilters(filters);
							if (!abilityWhere) {
								queryArgs.where = denyWhere(runtimeDataModel, model);
							} else {
								queryArgs.where =
									mergeWhere(queryArgs.where ?? {}, abilityWhere) ??
									queryArgs.where;
							}
							if (queryArgs.data) {
								await applyNestedWrites(
									prisma,
									runtimeDataModel,
									roleAbilities,
									role,
									model,
									queryArgs.data,
									context,
								);
							}
							return query(args);
						}
						if (operation === "upsert") {
							const canUpdate = await assertRecordAllowed(
								prisma,
								runtimeDataModel,
								roleAbilities,
								role,
								model,
								"UPDATE",
								queryArgs.where,
								context,
							);
							if (canUpdate) {
								if (args.update) {
									await applyNestedWrites(
										prisma,
										runtimeDataModel,
										roleAbilities,
										role,
										model,
										args.update,
										context,
									);
								}
							} else {
								if (args.create) {
									await assertCreateAllowed(
										prisma,
										runtimeDataModel,
										roleAbilities,
										role,
										model,
										args.create,
										context,
									);
									await applyNestedWrites(
										prisma,
										runtimeDataModel,
										roleAbilities,
										role,
										model,
										args.create,
										context,
									);
								} else {
									throw updateNotFoundError();
								}
							}
							return query(args);
						}
					}

					if (op === "DELETE") {
						if (operation === "delete") {
							const allowed = await assertRecordAllowed(
								prisma,
								runtimeDataModel,
								roleAbilities,
								role,
								model,
								"DELETE",
								queryArgs.where,
								context,
							);
							if (!allowed) throw deleteNotFoundError();
							return query(args);
						}
						if (operation === "deleteMany") {
							const filters =
								(await getAbilityFilters(
									prisma,
									runtimeDataModel,
									roleAbilities,
									role,
									model as Models,
									"DELETE",
									context,
								)) ?? [];
							const abilityWhere = combineAbilityFilters(filters);
							if (!abilityWhere) {
								queryArgs.where = denyWhere(runtimeDataModel, model);
							} else {
								queryArgs.where =
									mergeWhere(queryArgs.where ?? {}, abilityWhere) ??
									queryArgs.where;
							}
							return query(args);
						}
					}

					if (!UNIQUE_OPERATIONS.has(operation)) {
						return query(args);
					}

					return query(args);
				},
			},
		},
	});

	debug("Setup completed in", performance.now() - start, "ms");

	return client;
};
