import { PrismaClient } from "@prisma/client";
import { setup } from "../../src";

describe("setup", () => {
  describe("params.getRoles()", () => {
    it("should provide a set of built-in abilities for CRUD operations", async () => {
      const prisma = new PrismaClient();

      const getRoles = jest.fn((_abilities) => {
        return {
          USER: "*",
        } as any;
      });

      await setup({
        prisma,
        getRoles,
        getContext: () => null,
      });

      expect(getRoles.mock.calls).toHaveLength(1);
      const abilities = getRoles.mock.calls[0][0];

      expect(Object.keys(abilities)).toStrictEqual(["User", "Post"]);
      expect(Object.keys(abilities.User)).toStrictEqual([
        "create",
        "read",
        "update",
        "delete",
      ]);
      expect(Object.keys(abilities.Post)).toStrictEqual([
        "create",
        "read",
        "update",
        "delete",
      ]);
    });
  });
});
