import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl =
	process.env.DATABASE_URL_2 ??
	"postgresql://postgres:postgres@localhost:5432/yates_2";

export default defineConfig({
	schema: "schema.prisma",
	migrations: {
		path: "migrations",
	},
	datasource: {
		url: databaseUrl,
	},
});
