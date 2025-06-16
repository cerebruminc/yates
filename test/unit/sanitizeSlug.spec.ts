import { sanitizeSlug } from "../../src";

describe("sanitizeSlug", () => {
	it("replaces all hyphens with underscores", () => {
		const slug = "role--with-multiple---hyphens";
		expect(sanitizeSlug(slug)).toBe("role__with_multiple___hyphens");
	});
});
