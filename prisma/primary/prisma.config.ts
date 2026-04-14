import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl =
	process.env.DATABASE_URL ??
	"postgresql://postgres:postgres@localhost:5432/yates";

export default defineConfig({
	schema: "schema.prisma",
	migrations: {
		path: "migrations",
	},
	datasource: {
		url: databaseUrl,
	},
});
