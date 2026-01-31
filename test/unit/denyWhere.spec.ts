import { __private } from "../../src";

describe("denyWhere", () => {
	it("should throw if the model has no id field", () => {
		const runtimeDataModel = {
			models: {
				NoId: {
					dbName: "NoId",
					fields: [
						{
							name: "title",
							kind: "scalar",
							isId: false,
						},
					],
				},
			},
		} as any;

		expect(() => __private.denyWhere(runtimeDataModel, "NoId")).toThrow(
			'Model "NoId" has no @id field. Yates requires an ID to safely deny queries.',
		);
	});
});
