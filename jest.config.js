module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	verbose: true,
	modulePaths: ["node_modules", "<rootDir>"],
	testPathIgnorePatterns: ["<rootDir>/dist/", "<rootDir>/node_modules/"],
};
