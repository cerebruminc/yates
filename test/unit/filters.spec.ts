import { __private } from "../../src";

describe("matchesScalarFilter", () => {
	it("should match primitive equality and field refs", () => {
		const data = { authorId: "user-1", value: 5 };
		expect(__private.matchesScalarFilter(5, 5, data)).toBe(true);
		expect(__private.matchesScalarFilter(5, 6, data)).toBe(false);

		const fieldRef = { modelName: "Post", name: "authorId" } as any;
		const equalsFieldRef = { equals: fieldRef };
		expect(__private.matchesScalarFilter("user-1", equalsFieldRef, data)).toBe(
			true,
		);
	});

	it("should match scalar operators and negation", () => {
		const data = { SKU: "sku-1" };
		expect(__private.matchesScalarFilter(5, { lt: 10 }, data)).toBe(true);
		expect(__private.matchesScalarFilter(5, { lte: 5 }, data)).toBe(true);
		expect(__private.matchesScalarFilter(5, { gt: 10 }, data)).toBe(false);
		expect(__private.matchesScalarFilter(5, { gte: 5 }, data)).toBe(true);
		expect(
			__private.matchesScalarFilter("sku-1", { in: ["sku-1"] }, data),
		).toBe(true);
		expect(
			__private.matchesScalarFilter("sku-1", { notIn: ["sku-1"] }, data),
		).toBe(false);
		expect(
			__private.matchesScalarFilter("sku-1", { contains: "sku" }, data),
		).toBe(true);
		expect(
			__private.matchesScalarFilter("sku-1", { startsWith: "sku" }, data),
		).toBe(true);
		expect(
			__private.matchesScalarFilter("sku-1", { endsWith: "1" }, data),
		).toBe(true);
		expect(__private.matchesScalarFilter(5, { not: { equals: 5 } }, data)).toBe(
			false,
		);
	});
});

describe("validateContext", () => {
	it("should reject invalid keys and value types", () => {
		expect(() =>
			__private.validateContext({ "bad-key!": "ok" } as any),
		).toThrow("contains invalid characters");
		expect(() =>
			__private.validateContext({ good: { nested: true } as any }),
		).toThrow("must be a string, number or array");
		expect(() => __private.validateContext({ list: ["ok", 1 as any] })).toThrow(
			"must be an array of strings",
		);
	});
});
