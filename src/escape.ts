// Source borrowed from node-postgrs (which borrows from PG itself)
// https://github.com/brianc/node-postgres/blob/3f6760c62ee2a901d374b5e50c2f025b7d550315/packages/pg/lib/client.js#L408-L437
// We need to manually escape strings because we're interpolating client values into SQL statements that don't support `PREPARE`, such as `CREATE POLICY`

// Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
export const escapeIdentifier = function (str: string) {
	return `"${str.replace(/"/g, '""')}"`;
};

// Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
export const escapeLiteral = function (str: string) {
	var hasBackslash = false;
	var escaped = "'";

	for (var i = 0; i < str.length; i++) {
		var c = str[i];
		if (c === "'") {
			escaped += c + c;
		} else if (c === "\\") {
			escaped += c + c;
			hasBackslash = true;
		} else {
			escaped += c;
		}
	}

	escaped += "'";

	if (hasBackslash === true) {
		escaped = ` E${escaped}`;
	}

	return escaped;
};
