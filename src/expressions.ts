import { Prisma, PrismaClient } from "@prisma/client";
import { defineDmmfProperty } from "@prisma/client/runtime/library";
import logger from "debug";
import matches from "lodash/matches";
import random from "lodash/random";
import { Parser } from "node-sql-parser";
import { AsyncReturnType } from "type-fest";
import { jsonb_array_elements_text } from "./ast-fragments";
import { escapeLiteral } from "./escape";

const debug = logger("yates");

// This is black magic to get the runtime data model from the Prisma client
// It's not exported, so we need to use some type infiltration to get it
export type RuntimeDataModel = Parameters<typeof defineDmmfProperty>[1];

const PRISMA_NUMERIC_TYPES = ["Int", "BigInt", "Float", "Decimal"];

// This function is a recursive function that will search through an object and
// its children to find a matching object.
// It's used to find a matching AST fragment so that we can replace it with a token
// biome-ignore lint/suspicious/noExplicitAny: TODO future cleanup
const deepFind = (obj: any, subObj: any): any => {
	const matcher = matches(subObj);
	for (const key in obj) {
		if (matcher(obj[key])) {
			return obj[key];
		}
		if (typeof obj[key] === "object") {
			const result = deepFind(obj[key], subObj);
			if (result) {
				return result;
			}
		}
	}
};

type Token = {
	// biome-ignore lint/suspicious/noExplicitAny: TODO fix this
	astFragment: any;
};
type Tokens = Record<string, Token>;

type FFMeta<M extends Prisma.ModelName> =
	PrismaClient[Uncapitalize<M>]["findFirst"];
type ModelWhereArgs<M extends Prisma.ModelName> = Exclude<
	Parameters<FFMeta<M>>["0"],
	undefined
>["where"];
type ModelResult<M extends Prisma.ModelName> = AsyncReturnType<FFMeta<M>>;
type NonNullableModelResult<M extends Prisma.ModelName> = Exclude<
	ModelResult<M>,
	null
>;

// The expression below explicitly excludes returning a client query for the model the expression is for, as this can create infinite loops as the access logic recurses
export type Expression<ContextKeys extends string, M extends Prisma.ModelName> =
	| string
	| ((
			client: PrismaClient,
			// Explicitly return any, so that the prisma client doesn't error
			row: <K extends keyof NonNullableModelResult<M>>(
				col: K,
			) => NonNullableModelResult<M>[K],
			// TODO infer the return type of the context function automatically
			context: (key: ContextKeys) => string,
	  ) =>
			| Promise<ModelResult<Exclude<Prisma.ModelName, M>>>
			| ModelWhereArgs<M>);

// biome-ignore lint/suspicious/noExplicitAny: TODO fix this
const expressionRowName = (col: any) => `___yates_row_${col}`;
const expressionContext = (context: string) => `___yates_context_${context}`;
// Generate a big 32bit signed integer to use as an ID
const getLargeRandomInt = () => random(1000000000, 2147483647);

const getDmmfMetaData = (
	client: PrismaClient,
	model: string,
	field: string,
) => {
	// biome-ignore lint/suspicious/noExplicitAny: TODO fix this
	const runtimeDataModel = (client as any)
		._runtimeDataModel as RuntimeDataModel;
	const modelData = runtimeDataModel.models[model];
	if (!modelData) {
		throw new Error(
			`Could not retrieve model data from Prisma Client for model '${model}'`,
		);
	}
	// biome-ignore lint/suspicious/noExplicitAny: TODO fix this
	const fieldData = modelData.fields.find((f: any) => f.name === field);

	if (!fieldData) {
		throw new Error(
			`Could not retrieve field data from Prisma Client for field '${model}.${field}'`,
		);
	}

	return fieldData;
};

// Perform substitution of Ints so that Prisma doesn't throw an error due to mismatched type values
// After we've captured the SQL, we can replace the Ints with the original values
// The returned tokens are a map of the token int, and the AST fragment that will replace it.
// We can then reconstruct the query using the AST fragments.
const tokenizeWhereExpression = (
	/** The Prisma client to use for metadata */
	client: PrismaClient,
	/** The Prisma where expression to be tokenized */
	// biome-ignore lint/suspicious/noExplicitAny: TODO fix this
	where: Record<string, any>,
	/** The base table we are generating an expression for */
	table: string,
	/** The model name being queried. e.g. 'User' */
	model: string,
	/** The tokens object to add the new tokens to */
	tokens: Tokens = {},
): {
	tokens: Tokens;
	// biome-ignore lint/suspicious/noExplicitAny: TODO fix this
	where: Record<string, any>;
} => {
	for (const field in where) {
		// Get field data from the prisma client for the model and field being queried
		const fieldData = getDmmfMetaData(client, model, field);
		let int: number;

		// Small loop to make sure we get a unique int for the token key
		do {
			int = getLargeRandomInt();
		} while (tokens[int]);

		let astFragment = {};

		const value = where[field];

		// Check if the field is an object, if so, we need to recurse
		// This is a fairly simple approach but covers most cases like "some", "every", "none" etc.
		if (fieldData.kind === "object") {
			// List queries will always have a sub-object of "every", "some" or "none", so we need to dropdown and iterate through them
			if (fieldData.isList) {
				for (const subField in value) {
					const subValue = value[subField];

					const { tokens: subTokens, where: subWhere } =
						tokenizeWhereExpression(
							client,
							subValue,
							table,
							fieldData.type,
							tokens,
						);

					// biome-ignore lint/style/noParameterAssign: TODO fix this
					tokens = {
						...tokens,
						...subTokens,
					};

					where[field][subField] = subWhere;
				}
				continue;
			}
			const { tokens: subTokens, where: subWhere } = tokenizeWhereExpression(
				client,
				value,
				table,
				fieldData.type,
				tokens,
			);

			// biome-ignore lint/style/noParameterAssign: TODO fix this
			tokens = {
				...tokens,
				...subTokens,
			};

			where[field] = subWhere;
			continue;
		}
		const isNumeric = PRISMA_NUMERIC_TYPES.includes(fieldData.type);
		const isColumnName =
			typeof value === "string" && !!value.match(/^___yates_row_/);
		const isContext =
			typeof value === "string" && !!value.match(/^___yates_context_/);
		const isInStatement = !!value.in;

		switch (true) {
			case isColumnName:
				// Substiture the yates row placeholder for the actual column name
				// biome-ignore lint/correctness/noSwitchDeclarations: TODO fix this
				const column = value.replace(/^___yates_row_/, "");
				if (!getDmmfMetaData(client, table, column)) {
					throw new Error(`Invalid field name "${column}"`);
				}
				astFragment = {
					type: "column_ref",
					schema: "public",
					table: table,
					column: column,
				};
				break;

			case isContext && isNumeric:
				astFragment = {
					as: null,
					type: "cast",
					expr: {
						type: "function",
						name: "current_setting",
						args: {
							type: "expr_list",
							value: [
								{
									type: "parameter",
									value: escapeLiteral(value.replace(/^___yates_context_/, "")),
								},
							],
						},
					},
					symbol: "::",
					target: {
						dataType: "float",
						suffix: [],
					},
				};
				break;

			case isContext && !isNumeric:
				astFragment = {
					type: "function",
					name: "current_setting",
					args: {
						type: "expr_list",
						value: [
							{
								type: "parameter",
								value: escapeLiteral(value.replace(/^___yates_context_/, "")),
							},
						],
					},
				};
				break;

			case isNumeric:
				if (typeof value !== "number") {
					throw new Error(
						`Numeric fields can only be queried with numbers: querying field '${field}' with value '${value}'`,
					);
				}
				astFragment = {
					type: "number",
					value,
				};
				break;

			case isInStatement:
				// This is a bit hokey, but we are going to assume that each value here is static, and
				// perform tokenization on each value in the `in` array.
				// The ideal solution is to rework this tokenization function so that it recurses until it
				// finds a scalar value, and then tokenizes that value, with checking for row/context values.
				if (Array.isArray(value.in)) {
					const tokenList = [];

					for (const item of value.in) {
						// biome-ignore lint/suspicious/noImplicitAnyLet: TODO fix this
						let inToken;
						do {
							inToken = getLargeRandomInt();
						} while (tokens[int]);

						tokens[inToken] = {
							astFragment: {
								type: "parameter",
								value: escapeLiteral(item),
							},
						};

						tokenList.push(isNumeric ? inToken : `${inToken}`);
					}
					where[field] = {
						in: tokenList,
					};
					continue;
				}
				// If the value of `in` is a context value, we assume that it is an array that has been JSON encoded
				// We create an AST fragment representing a function call to `jsonb_array_elements_text` with the context value as the argument
				astFragment = jsonb_array_elements_text(value.in);

				break;

			// All other types are treated as strings
			default:
				astFragment = {
					type: "parameter",
					value: escapeLiteral(value),
				};
				break;
		}

		tokens[int] = {
			astFragment,
		};

		where[field] = isNumeric ? int : `${int}`;
	}

	return {
		tokens,
		where,
	};
};

export const expressionToSQL = async <
	ContextKeys extends string,
	YModel extends Prisma.ModelName,
>(
	getExpression: Expression<ContextKeys, YModel>,
	table: string,
): Promise<string> => {
	if (typeof getExpression === "string") {
		return getExpression;
	}

	debug("Creating RLS expression from", getExpression.toString());

	// Create an ephemeral client to capture the SQL query
	const baseClient = new PrismaClient({
		log: [{ level: "query", emit: "event" }],
	});

	const tokens: Tokens = {};

	// An extended client is used to capture the SQL query that is generated
	// by the expression function, this allows us to:
	// - tokenize the where clause, allowing for use of context and row values
	// - ensures that only findFirst and findUnique are used
	// - isolates the query from any other queries that may be running
	const expressionClient = baseClient.$extends({
		name: "expressionClient",
		query: {
			$allModels: {
				$allOperations({ model, operation, args, query }) {
					// if not findFirst or findUnique
					if (operation !== "findFirst" && operation !== "findUnique") {
						throw new Error(
							'Only "findFirst" and "findUnique" are supported in client expressions',
						);
					}

					if ("where" in args && args.where) {
						const { where } = tokenizeWhereExpression(
							baseClient,
							args.where,
							table,
							model,
							tokens,
						);
						args.where = where;
					}

					return query(args);
				},
			},
		},
	});

	const sql = await new Promise<string>(
		// biome-ignore lint/suspicious/noAsyncPromiseExecutor: future cleanup
		async (resolve, reject) => {
			const rawExpression = getExpression(
				// biome-ignore lint/suspicious/noExplicitAny: TODO fix this
				expressionClient as any as PrismaClient,
				// biome-ignore lint/suspicious/noExplicitAny: TODO fix this
				expressionRowName as any,
				expressionContext,
			);
			// If the raw expression is a promise, then this is a client subselect,
			// as opposed to a plain SQL expression or "where" object
			const isSubselect =
				typeof rawExpression === "object" &&
				"then" in rawExpression &&
				// biome-ignore lint/suspicious/noExplicitAny: TODO fix this
				typeof (rawExpression as Promise<any>).then === "function";

			// biome-ignore lint/suspicious/noExplicitAny: TODO fix this
			baseClient.$on("query", (e: any) => {
				try {
					const parser = new Parser();
					// Parse the query into an AST
					// biome-ignore lint/suspicious/noExplicitAny: TODO fix this
					const ast: any = parser.astify(e.query, {
						database: "postgresql",
					});

					const params = JSON.parse(e.params);

					// By default Prisma will use a parameter for the limit, for Yates, the value is always "1"
					ast.limit = { seperator: "", value: [{ type: "number", value: 1 }] };

					// Now that the SQL has been generated, we can replace the tokens with the original values
					for (let i = 0; i < params.length; i++) {
						const param = params[i];
						const token = tokens[param];

						// If there is no token, we can skip this. The most likely cause of this is that the parameter is for a limit or offset, which we cull from the SQL anyway
						if (!token) {
							continue;
						}

						const parameterizedStatement = deepFind(ast, {
							type: "var",
							name: i + 1,
							prefix: "$",
						});

						// If we found a matching parameterized statement, we can replace it with the AST fragment.
						// This will replace the parameter with the original value.
						// We do this by mutating the object returned from the deepfind function.
						if (parameterizedStatement) {
							// First, scrub all the keys from the parameterized statement
							for (const key of Object.keys(parameterizedStatement)) {
								Reflect.deleteProperty(parameterizedStatement, key);
							}
							// Second, add all the keys from the AST fragment to the parameterized statement
							for (const key of Object.keys(token.astFragment)) {
								parameterizedStatement[key] = token.astFragment[key];
							}
						}
					}

					if (isSubselect) {
						// For subselects, we need to convert the entire query and wrap in EXISTS so it converts to a binary expression
						const subSelect = parser.sqlify(ast, {
							database: "postgresql",
						});
						resolve(`EXISTS(${subSelect})`);
					} else {
						// For basic expressions, we're only interested in the WHERE clause and can convert just the WHERE clause into SQL
						const where = parser.exprToSQL(ast.where, {
							database: "postgresql",
						});

						resolve(where);
					}
				} catch (error) {
					reject(error);
				}
			});

			try {
				// If the raw expression is a promise, we need to wait for it to resolve
				if (isSubselect) {
					await rawExpression;
				} else {
					// biome-ignore lint/suspicious/noExplicitAny: TODO fix this
					await (expressionClient as any)[table].findFirst({
						where: rawExpression,
					});
				}
			} catch (error) {
				reject(error);
			}
		},
	);

	// Close the client
	await expressionClient.$disconnect();
	await baseClient.$disconnect();

	debug("Generated RLS expression", sql);

	return sql;
};
