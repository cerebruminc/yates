import { PrismaClient } from "@prisma/client";
import random from "lodash/random";
import matches from "lodash/matches";
import { Parser } from "node-sql-parser";
import { escapeLiteral } from "./escape";
import { defineDmmfProperty } from "@prisma/client/runtime/library";

// This is black magic to get the runtime data model from the Prisma client
// It's not exported, so we need to use some type infiltration to get it
export type RuntimeDataModel = Parameters<typeof defineDmmfProperty>[1];

const PRISMA_NUMERIC_TYPES = ["Int", "BigInt", "Float", "Decimal"];

const deepFind = (obj: any, subObj: any): any => {
	const matcher = matches(subObj);
	for (const key in obj) {
		if (matcher(obj[key])) {
			return obj[key];
		} else if (typeof obj[key] === "object") {
			const result = deepFind(obj[key], subObj);
			if (result) {
				return result;
			}
		}
	}
};

type Token = {
	astFragment: any;
};
type Tokens = Record<string, Token>;

export type Expression<ContextKeys extends string = string> =
	| string
	| ((
			client: PrismaClient,
			// Explicitly return any, so that the prisma client doesn't error
			row: (col: string) => any,
			context: (key: ContextKeys) => string,
	  ) => Promise<any> | { [col: string]: any });

const expressionRowName = (col: string) => `___yates_row_${col}`;
const expressionContext = (context: string) => `___yates_context_${context}`;
// Generate a big 32bit signed integer to use as an ID
const getLargeRandomInt = () => random(1000000000, 2147483647);

const getDmmfMetaData = (client: PrismaClient, model: string, field: string) => {
	const runtimeDataModel = (client as any)._runtimeDataModel as RuntimeDataModel;
	const modelData = runtimeDataModel.models[model];
	if (!modelData) {
		throw new Error(`Could not retrieve model data from Prisma Client for model '${model}'`);
	}
	const fieldData = modelData.fields.find((f: any) => f.name === field);

	if (!fieldData) {
		throw new Error(`Could not retrieve field data from Prisma Client for field '${model}.${field}'`);
	}

	return fieldData;
};

// Perform substitution of Ints so that Prisma doesn't throw an error due to mismatched type values
// After we've captured the SQL, we can replace the Ints with the original values
const tokenizeWhereExpression = (
	/** The Prisma client to use for metadata */
	client: PrismaClient,
	/** The Prisma where expression to be tokenized */
	where: Record<string, any>,
	/** The base table we are generating an expression for */
	table: string,
	/** The model name being queried. e.g. 'User' */
	model: string,
	/** The tokens object to add the new tokens to */
	tokens: Tokens = {},
): {
	tokens: Tokens;
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
			for (const subField in value) {
				const subValue = value[subField];

				const { tokens: subTokens, where: subWhere } = tokenizeWhereExpression(
					client,
					subValue,
					table,
					fieldData.type,
					tokens,
				);

				tokens = {
					...tokens,
					...subTokens,
				};

				where[field][subField] = subWhere;
			}
			continue;
		}
		const isNumeric = PRISMA_NUMERIC_TYPES.includes(fieldData.type);
		const isColumnName = typeof value === "string" && !!value.match(/^___yates_row_/);
		const isContext = typeof value === "string" && !!value.match(/^___yates_context_/);

		switch (true) {
			case isColumnName:
				// Substiture the yates row placeholder for the actual column name
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

export const expressionToSQL = async (getExpression: Expression, table: string): Promise<string> => {
	if (typeof getExpression === "string") {
		return getExpression;
	}

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
						throw new Error('Only "findFirst" and "findUnique" are supported in client expressions');
					}

					if ("where" in args && args.where) {
						const { where } = tokenizeWhereExpression(baseClient, args.where, table, model, tokens);
						args.where = where;
					}

					return query(args);
				},
			},
		},
	});

	const sql = await new Promise<string>(
		// rome-ignore lint/suspicious/noAsyncPromiseExecutor: future cleanup
		async (resolve, reject) => {
			const rawExpression = getExpression(
				expressionClient as any as PrismaClient,
				expressionRowName,
				expressionContext,
			);
			// If the raw expression is a promise, then this is a client subselect,
			// as opposed to a plain SQL expression or "where" object
			const isSubselect = typeof rawExpression === "object" && typeof rawExpression.then === "function";

			baseClient.$on("query", (e: any) => {
				try {
					const parser = new Parser();
					// Parse the query into an AST
					const ast: any = parser.astify(e.query, {
						database: "postgresql",
					});

					const params = JSON.parse(e.params);

					// By default Prisma will use a parameter for the limit, for Yates, the value is always "1"
					ast.limit = { seperator: "", value: [{ type: "number", value: 1 }] };

					// Now that the SQL has been generated, we can replace the tokens with the original values
					for (let i = 0; i < params.length; i++) {
						let param = params[i];
						const token = tokens[param];

						if (!token) {
							continue;
						}

						const parameterizedStatement = deepFind(ast, {
							right: {
								type: "var",
								name: i + 1,
								prefix: "$",
							},
						});

						if (!parameterizedStatement) {
							continue;
						}

						parameterizedStatement.right = token.astFragment;
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

	return sql;
};
