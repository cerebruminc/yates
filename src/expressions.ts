import { Prisma, PrismaClient } from "@prisma/client";
import { defineDmmfProperty } from "@prisma/client/runtime/library";

// This is black magic to get the runtime data model from the Prisma client
// It's not exported, so we need to use some type infiltration to get it
export type RuntimeDataModel = Parameters<typeof defineDmmfProperty>[1];

type FFMeta<M extends Prisma.ModelName> =
	PrismaClient[Uncapitalize<M>]["findFirst"];
type ModelWhereArgs<M extends Prisma.ModelName> = Exclude<
	Parameters<FFMeta<M>>["0"],
	undefined
>["where"];

type ModelFieldRefs<M extends Prisma.ModelName> =
	PrismaClient[Uncapitalize<M>]["fields"];

export type ExpressionContext<ContextKeys extends string> = (
	key: ContextKeys,
) => string | number | string[] | undefined;

export type ExpressionRow<M extends Prisma.ModelName> = <
	K extends keyof ModelFieldRefs<M>,
>(
	col: K,
) => ModelFieldRefs<M>[K];

export type Expression<ContextKeys extends string, M extends Prisma.ModelName> =
	| ModelWhereArgs<M>
	| ((
			client: PrismaClient,
			row: ExpressionRow<M>,
			context: ExpressionContext<ContextKeys>,
	  ) => ModelWhereArgs<M> | Promise<ModelWhereArgs<M>>);
