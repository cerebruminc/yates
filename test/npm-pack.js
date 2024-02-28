/**
 * This is a simple test script that checks that the package can be required and
 * that the setup export is defined.
 * This script is used in the `npm-pack-check` GitHub workflow.
 */
const yates = require("@cerebruminc/yates");

if (typeof yates.setup === "undefined") {
	throw new Error("setup export is undefined");
}

console.log("Success!");
