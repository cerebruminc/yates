import { setup } from ".";
import { PrismaClient } from "@prisma/client";
const user_org_setting = "context.user.org";
const user_id_setting = "context.user.id";
const user_email_setting = "context.user.email";

// Note: Settings used for RLS must be set in the same transaction as the RLS
// Additionally, the expressions expect the setting value to be serialized as JSON
const hasUserIdExpression = (model: string) =>
	`current_setting('${user_id_setting}'::text) = "${model}"."userId"`;
const expressions = {
	hasOrganizationId: (model: string) =>
		`current_setting('${user_org_setting}'::text) = "${model}"."organizationId"`,
	hasUserId: hasUserIdExpression,
	hasUserEmail: (model: string) =>
		`current_setting('${user_email_setting}'::text) = "${model}"."email"`,
	orderHasUserId: `EXISTS(SELECT "userId" FROM "Order" WHERE "Order".id = "orderId" AND ${hasUserIdExpression(
		"Order",
	)})`,
};

const configureRls = async (prisma: PrismaClient) => {
	const client = await setup({
		prisma,
		customAbilities: {
			Address: {
				createWithOwnUser: {
					description: "Create address using own userId",
					operation: "INSERT",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				readWithOwnUser: {
					description: "Read address with own userId",
					operation: "SELECT",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				updateWithOwnUser: {
					description: "Update address with own userId",
					operation: "UPDATE",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				deleteWithOwnUser: {
					description: "Delete address with own userId",
					operation: "DELETE",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				createWithOwnOrder: {
					description: "Create Address attached to own Order",
					expression: `EXISTS(SELECT "userId" FROM "Order" JOIN "ApplicantData" on "ApplicantData"."id" = "applicantDataId" WHERE "Order".id = "orderId" AND ${hasUserIdExpression(
						"Order",
					)})`,
					operation: "INSERT",
				},
				readWithOwnOrder: {
					description: "Read Address attached to own Order",
					expression: `EXISTS(SELECT "userId" FROM "Order" JOIN "ApplicantData" on "ApplicantData"."id" = "applicantDataId" WHERE "Order".id = "orderId" AND ${hasUserIdExpression(
						"Order",
					)})`,
					operation: "SELECT",
				},
				createWithOwnOrgOrder: {
					description: "Read Address attached to Order in own Organization",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" JOIN "ApplicantData" on "ApplicantData"."id" = "applicantDataId" WHERE "Order".id = "ApplicantData"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
					operation: "INSERT",
				},
				readWithOwnOrgOrder: {
					description: "Read Address attached to Order in own Organization",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" JOIN "ApplicantData" on "ApplicantData"."id" = "applicantDataId" WHERE "Order".id = "ApplicantData"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
					operation: "SELECT",
				},
				createWithOwnStateIdentificationCard: {
					description: "Create Address attached to own StateIdentificationCard",
					expression: `
            EXISTS(
              SELECT "StateIdentificationCard"."id" 
              FROM "StateIdentificationCard" 
              WHERE "StateIdentificationCard"."id" = "Address"."stateIdentificationCardId" 
              AND "StateIdentificationCard"."userId" = current_setting('${user_id_setting}')
            )
          `,
					operation: "INSERT",
				},
				readWithOwnStateIdentificationCard: {
					description: "Read Address attached to own StateIdentificationCard",
					expression: `
            EXISTS(
              SELECT "StateIdentificationCard"."id" 
              FROM "StateIdentificationCard" 
              WHERE "StateIdentificationCard"."id" = "Address"."stateIdentificationCardId" 
              AND "StateIdentificationCard"."userId" = current_setting('${user_id_setting}')
            )
          `,
					operation: "SELECT",
				},
				createWithOwnPassport: {
					description: "Create Address attached to own Passport",
					expression: `
            EXISTS(
              SELECT "Passport"."id" 
              FROM "Passport" 
              WHERE "Passport"."id" = "Address"."passportId" 
              AND "Passport"."userId" = current_setting('${user_id_setting}')
            )
          `,
					operation: "INSERT",
				},
				readWithOwnPassport: {
					description: "Read Address attached to own Passport",
					expression: `
            EXISTS(
              SELECT "Passport"."id" 
              FROM "Passport" 
              WHERE "Passport"."id" = "Address"."passportId" 
              AND "Passport"."userId" = current_setting('${user_id_setting}')
            )
          `,
					operation: "SELECT",
				},
			},
			ApplicantData: {
				createWithOwnUser: {
					description: "Create applicant data for Order using own userId",
					operation: "INSERT",
					expression: expressions.orderHasUserId,
				},
				readWithOwnUser: {
					description: "Read applicant data for Order using own userId",
					operation: "SELECT",
					expression: expressions.orderHasUserId,
				},
				updateWithOwnUser: {
					description: "Update applicant data for Order using own userId",
					operation: "UPDATE",
					expression: expressions.orderHasUserId,
				},
				deleteWithOwnUser: {
					description: "Delete applicant data for Order using own userId",
					operation: "DELETE",
					expression: expressions.orderHasUserId,
				},
				createWithOwnOrgOrder: {
					description: "Read Address attached to Order in own Organization",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" WHERE "Order".id = "ApplicantData"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
					operation: "INSERT",
				},
				readWithOwnOrgOrder: {
					description: "Read Address attached to Order in own Organization",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" WHERE "Order".id = "ApplicantData"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
					operation: "SELECT",
				},
			},
			Beam: {
				createWithOwnOrg: {
					description: "Create Beam in own organization",
					expression: expressions.hasOrganizationId("Beam"),
					operation: "INSERT",
				},
				readWithOwnOrg: {
					description: "Read Beam in own organization",
					expression: expressions.hasOrganizationId("Beam"),
					operation: "SELECT",
				},
				updateWithOwnOrg: {
					description: "Update Beam in own organization",
					expression: expressions.hasOrganizationId("Beam"),
					operation: "UPDATE",
				},
				deleteWithOwnOrg: {
					description: "Delete Beam in own organization",
					expression: expressions.hasOrganizationId("Beam"),
					operation: "DELETE",
				},
			},
			Credential: {
				createWithOwnOrg: {
					description: "Create Credential in own organization",
					expression: expressions.hasOrganizationId("Credential"),
					operation: "INSERT",
				},
				readWithOwnOrg: {
					description: "Read Credential in own organization",
					expression: expressions.hasOrganizationId("Credential"),
					operation: "SELECT",
				},
				readWithOwnUser: {
					description: "Read Credential with own userId",
					operation: "SELECT",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
			},
			CredentialStatus: {
				createWithOwnOrg: {
					description: "Create CredentialStatus in own organization",
					expression: `EXISTS(SELECT "Credential".id FROM "Credential" WHERE "Credential".id = "CredentialStatus"."credentialId" AND ${expressions.hasOrganizationId(
						"Credential",
					)})`,
					operation: "INSERT",
				},
				readWithOwnOrg: {
					description: "Read CredentialStatus in own organization",
					expression: `EXISTS(SELECT "Credential".id FROM "Credential" WHERE (("Credential".id = "CredentialStatus"."credentialId") AND (${expressions.hasOrganizationId(
						"Credential",
					)})))`,
					operation: "SELECT",
				},
				updateWithOwnOrg: {
					description: "Update CredentialStatus in own organization",
					expression: `EXISTS(SELECT "Credential"."id" FROM "Credential" WHERE "Credential".id = "CredentialStatus"."credentialId" AND ${expressions.hasOrganizationId(
						"Credential",
					)})`,
					/*
					expression: (client, row, context) => {
						return client.credential.findFirst({
							where: {
								id: row("credentialId"),
								organizationId: context(user_org_setting),
							},
						});
					},
					*/
					operation: "UPDATE",
				},
			},
			CredentialType: {
				createWithOwnOrg: {
					description: "Create CredentialType in own organization",
					expression: expressions.hasOrganizationId("CredentialType"),
					operation: "INSERT",
				},
				readWithOwnOrg: {
					description: "Read CredentialType in own organization",
					expression: expressions.hasOrganizationId("CredentialType"),
					operation: "SELECT",
				},
				readWithOwnUser: {
					description: "Read CredentialType attached to own Credential",
					expression: `EXISTS(SELECT "Credential"."id" FROM "Credential" WHERE "Credential"."typeId" = "CredentialType"."id" AND ${expressions.hasUserId(
						"Credential",
					)})`,
					operation: "SELECT",
				},
			},
			ComplianceLetter: {
				readWithOwnUser: {
					description: "Read ComplianceLetter for Order using own userId",
					operation: "SELECT",
					expression: expressions.orderHasUserId,
				},
			},
			LegacyCredential: {
				readWithOwnUser: {
					description: "Read LegacyCredential with own userId",
					operation: "SELECT",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
			},
			DispatchedSearch: {
				readWithOwnOrgOrder: {
					description:
						"Read DispatchedSearch attached to Order in own Organization",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" WHERE "Order".id = "DispatchedSearch"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
					operation: "SELECT",
				},
			},
			File: {
				createWithOwnUser: {
					description: "Create File for Order using own userId",
					operation: "INSERT",
					expression: expressions.orderHasUserId,
				},
				readWithOwnUser: {
					description: "Read File for Order using own userId",
					operation: "SELECT",
					expression: expressions.orderHasUserId,
				},
				createOwnSelfie: {
					description: "Create own selfie File",
					operation: "INSERT",
					expression: `EXISTS(SELECT "id" FROM "User" WHERE "User"."id" = "selfieUserId" AND current_setting('${user_id_setting}') = "User"."id")`,
				},
				readOwnSelfie: {
					description: "Read own selfie File",
					operation: "SELECT",
					expression: `EXISTS(SELECT "id" FROM "User" WHERE "User"."id" = "selfieUserId" AND current_setting('${user_id_setting}') = "User"."id")`,
				},
				updateOwnSelfie: {
					description: "Update own selfie File",
					operation: "UPDATE",
					expression: `EXISTS(SELECT "id" FROM "User" WHERE "User"."id" = "selfieUserId" AND current_setting('${user_id_setting}') = "User"."id")`,
				},
				createOwnFrontId: {
					description: "Create own front ID File",
					operation: "INSERT",
					expression: `EXISTS(SELECT "id" FROM "User" WHERE "User"."id" = "frontIdUserId" AND current_setting('${user_id_setting}') = "User"."id")`,
				},
				readOwnFrontId: {
					description: "Read own front ID File",
					operation: "SELECT",
					expression: `EXISTS(SELECT "id" FROM "User" WHERE "User"."id" = "frontIdUserId" AND current_setting('${user_id_setting}') = "User"."id")`,
				},
				updateOwnFrontId: {
					description: "Update own front ID File",
					operation: "UPDATE",
					expression: `EXISTS(SELECT "id" FROM "User" WHERE "User"."id" = "frontIdUserId" AND current_setting('${user_id_setting}') = "User"."id")`,
				},
				createOwnBackId: {
					description: "Create own back ID File",
					operation: "INSERT",
					expression: `EXISTS(SELECT "id" FROM "User" WHERE "User"."id" = "backIdUserId" AND current_setting('${user_id_setting}') = "User"."id")`,
				},
				readOwnBackId: {
					description: "Read own back ID File",
					operation: "SELECT",
					expression: `EXISTS(SELECT "id" FROM "User" WHERE "User"."id" = "backIdUserId" AND current_setting('${user_id_setting}') = "User"."id")`,
				},
				updateOwnBackId: {
					description: "Update own back ID File",
					operation: "UPDATE",
					expression: `EXISTS(SELECT "id" FROM "User" WHERE "User"."id" = "backIdUserId" AND current_setting('${user_id_setting}') = "User"."id")`,
				},
				createWithOwnOrgOrder: {
					description: "Create File attached to Order in own Organization",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" WHERE "Order".id = "File"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
					operation: "INSERT",
				},
				readWithOwnOrgOrder: {
					description: "Read File attached to Order in own Organization",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" WHERE "Order".id = "File"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
					operation: "SELECT",
				},
				updateWithOwnOrgOrder: {
					description: "Update File attached to Order in own Organization",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" WHERE "Order".id = "File"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
					operation: "UPDATE",
				},
				deleteWithOwnOrgOrder: {
					description: "Delete File attached to Order in own Organization",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" WHERE "Order".id = "File"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
					operation: "DELETE",
				},
				createWithOwnStateIdentificationCard: {
					description: "Create File attached to own StateIdentificationCard",
					expression: `
            EXISTS(
              SELECT "StateIdentificationCard"."id"
              FROM "StateIdentificationCard"
              WHERE (
                "StateIdentificationCard"."id" = "File"."stateIdentificationCardSelfieId" OR
                "StateIdentificationCard"."id" = "File"."stateIdentificationCardFrontId" OR
                "StateIdentificationCard"."id" = "File"."stateIdentificationCardBackId" OR
                "StateIdentificationCard"."id" = "File"."stateIdentificationCardExtractId"
              )
              AND "StateIdentificationCard"."userId" = current_setting('${user_id_setting}')
            )
          `,
					operation: "INSERT",
				},
				readWithOwnStateIdentificationCard: {
					description: "Read File attached to own StateIdentificationCard",
					expression: `
            EXISTS(
              SELECT "StateIdentificationCard"."id"
              FROM "StateIdentificationCard"
              WHERE (
                "StateIdentificationCard"."id" = "File"."stateIdentificationCardSelfieId" OR
                "StateIdentificationCard"."id" = "File"."stateIdentificationCardFrontId" OR
                "StateIdentificationCard"."id" = "File"."stateIdentificationCardBackId" OR
                "StateIdentificationCard"."id" = "File"."stateIdentificationCardExtractId"
              )
              AND "StateIdentificationCard"."userId" = current_setting('${user_id_setting}')
            )
          `,
					operation: "SELECT",
				},
				updateWithOwnStateIdentificationCard: {
					description: "Update File attached to own StateIdentificationCard",
					expression: `
            EXISTS(
              SELECT "StateIdentificationCard"."id"
              FROM "StateIdentificationCard"
              WHERE (
                "StateIdentificationCard"."id" = "File"."stateIdentificationCardSelfieId" OR
                "StateIdentificationCard"."id" = "File"."stateIdentificationCardFrontId" OR
                "StateIdentificationCard"."id" = "File"."stateIdentificationCardBackId" OR
                "StateIdentificationCard"."id" = "File"."stateIdentificationCardExtractId"
              )
              AND "StateIdentificationCard"."userId" = current_setting('${user_id_setting}')
            )
          `,
					operation: "UPDATE",
				},
				createWithOwnPassport: {
					description: "Create File attached to own Passport",
					expression: `
            EXISTS(
              SELECT "Passport"."id"
              FROM "Passport"
              WHERE (
                "Passport"."id" = "File"."passportCardSelfieId" OR
                "Passport"."id" = "File"."passportFrontId" OR
                "Passport"."id" = "File"."passportExtractPhotoId"
              )
              AND "Passport"."userId" = current_setting('${user_id_setting}')
            )
          `,
					operation: "INSERT",
				},
				readWithOwnPassport: {
					description: "Read File attached to own Passport",
					expression: `
            EXISTS(
              SELECT "Passport"."id"
              FROM "Passport"
              WHERE (
                "Passport"."id" = "File"."passportCardSelfieId" OR
                "Passport"."id" = "File"."passportFrontId" OR
                "Passport"."id" = "File"."passportExtractPhotoId"
              )
              AND "Passport"."userId" = current_setting('${user_id_setting}')
            )
          `,
					operation: "SELECT",
				},
				updateWithOwnPassport: {
					description: "Update File attached to own Passport",
					expression: `
          EXISTS(
            SELECT "Passport"."id"
            FROM "Passport"
            WHERE (
              "Passport"."id" = "File"."passportCardSelfieId" OR
              "Passport"."id" = "File"."passportFrontId" OR
              "Passport"."id" = "File"."passportExtractPhotoId"
            )
            AND "Passport"."userId" = current_setting('${user_id_setting}')
          )
          `,
					operation: "UPDATE",
				},
			},
			BeamInput: {
				createWithOwnOrg: {
					description: "Create BeamInput in own organization",
					expression: `EXISTS(SELECT "BeamInputType"."id" FROM "BeamInputType" WHERE "BeamInputType"."id" = "BeamInput"."typeId" AND ${expressions.hasOrganizationId(
						"BeamInput",
					)})`,
					operation: "INSERT",
				},
				readWithOwnOrg: {
					description: "Read BeamInput in own organization",
					expression: `EXISTS(SELECT "BeamInputType"."id" FROM "BeamInputType" WHERE "BeamInputType"."id" = "BeamInput"."typeId" AND ${expressions.hasOrganizationId(
						"BeamInput",
					)})`,
					operation: "SELECT",
				},
				createWithOwnUser: {
					description: "Create BeamInput with own userId",
					operation: "INSERT",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				readWithOwnUser: {
					description: "Read BeamInput with own userId",
					operation: "SELECT",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
			},
			BeamInputType: {
				createWithOwnOrg: {
					description: "Create BeamInputType in own organization",
					expression: expressions.hasOrganizationId("BeamInputType"),
					operation: "INSERT",
				},
				readWithOwnOrg: {
					description: "Read BeamInputType in own organization",
					expression: expressions.hasOrganizationId("BeamInputType"),
					operation: "SELECT",
				},
			},
			Name: {
				createWithOwnUser: {
					description: "Create Name with own userId",
					operation: "INSERT",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				readWithOwnUser: {
					description: "Read Name with own userId",
					operation: "SELECT",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				updateWithOwnUser: {
					description: "Update Name with own userId",
					operation: "UPDATE",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				deleteWithOwnUser: {
					description: "Delete Name with own userId",
					operation: "DELETE",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				createWithOwnOrder: {
					description: "Create Name attached to own Order",
					expression: `EXISTS(SELECT "userId" FROM "Order" JOIN "ApplicantData" on "ApplicantData"."id" = "applicantDataId" WHERE "Order".id = "orderId" AND ${hasUserIdExpression(
						"Order",
					)})`,
					operation: "INSERT",
				},
				readWithOwnOrder: {
					description: "Read Name attached to own Order",
					expression: `EXISTS(SELECT "userId" FROM "Order" JOIN "ApplicantData" on "ApplicantData"."id" = "applicantDataId" WHERE "Order".id = "orderId" AND ${hasUserIdExpression(
						"Order",
					)})`,
					operation: "SELECT",
				},
				createWithOwnOrgOrder: {
					description: "Create Name attached to Order in own Organization",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" JOIN "ApplicantData" on "ApplicantData"."id" = "applicantDataId" WHERE "Order".id = "ApplicantData"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
					operation: "INSERT",
				},
				readWithOwnOrgOrder: {
					description: "Read Name attached to Order in own Organization",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" JOIN "ApplicantData" on "ApplicantData"."id" = "applicantDataId" WHERE "Order".id = "ApplicantData"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
					operation: "SELECT",
				},
				updateWithOwnOrgOrder: {
					description: "Update Address attached to Order in own Organization",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" JOIN "ApplicantData" on "ApplicantData"."id" = "applicantDataId" WHERE "Order".id = "ApplicantData"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
					operation: "UPDATE",
				},
				deleteWithOwnOrgOrder: {
					description: "Delete Address attached to Order in own Organization",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" JOIN "ApplicantData" on "ApplicantData"."id" = "applicantDataId" WHERE "Order".id = "ApplicantData"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
					operation: "DELETE",
				},
				createWithOwnStateIdentificationCard: {
					description: "Create Name attached to own StateIdentificationCard",
					expression: `
            EXISTS(
              SELECT "StateIdentificationCard"."id" 
              FROM "StateIdentificationCard" 
              WHERE "StateIdentificationCard"."id" = "Name"."stateIdentificationCardId" 
              AND "StateIdentificationCard"."userId" = current_setting('${user_id_setting}')
            )
          `,
					operation: "INSERT",
				},
				readWithOwnStateIdentificationCard: {
					description: "Read Name attached to own StateIdentificationCard",
					expression: `
            EXISTS(
              SELECT "StateIdentificationCard"."id" 
              FROM "StateIdentificationCard" 
              WHERE "StateIdentificationCard"."id" = "Name"."stateIdentificationCardId" 
              AND "StateIdentificationCard"."userId" = current_setting('${user_id_setting}')
            )
          `,
					operation: "SELECT",
				},
				createWithOwnPassport: {
					description: "Create Name attached to own Passport",
					expression: `
            EXISTS(
              SELECT "Passport"."id" 
              FROM "Passport" 
              WHERE "Passport"."id" = "Name"."passportId" 
              AND "Passport"."userId" = current_setting('${user_id_setting}')
            )
          `,
					operation: "INSERT",
				},
				readWithOwnPassport: {
					description: "Read Name attached to own Passport",
					expression: `
          EXISTS(
            SELECT "Passport"."id" 
            FROM "Passport" 
            WHERE "Passport"."id" = "Name"."passportId" 
            AND "Passport"."userId" = current_setting('${user_id_setting}')
          )
          `,
					operation: "SELECT",
				},
			},
			Order: {
				createInOwnOrg: {
					description: "Create Order in own organization",
					expression: expressions.hasOrganizationId("Order"),
					operation: "INSERT",
				},
				readInOwnOrg: {
					description: "Read Order in own organization",
					expression: expressions.hasOrganizationId("Order"),
					operation: "SELECT",
				},
				updateInOwnOrg: {
					description: "Read Order in own organization",
					expression: expressions.hasOrganizationId("Order"),
					operation: "UPDATE",
				},
				deleteInOwnOrg: {
					description: "Read Order in own organization",
					expression: expressions.hasOrganizationId("Order"),
					operation: "DELETE",
				},
				readWithOwnUser: {
					description: "Read Order with own userId",
					operation: "SELECT",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				createWithOwnUser: {
					description: "Create Order with own userId",
					operation: "INSERT",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
			},
			OrderNote: {
				createWithOwnUser: {
					description: "Create OrderNote for Order using own userId",
					operation: "INSERT",
					expression: expressions.orderHasUserId,
				},
				readWithOwnUser: {
					description: "Read OrderNote for Order using own userId",
					operation: "SELECT",
					expression: expressions.orderHasUserId,
				},
				createWithOwnOrgOrder: {
					description: "Create OrderNote for Order in own Organization",
					operation: "INSERT",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" WHERE "Order".id = "OrderNote"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
				},
				readWithOwnOrgOrder: {
					description: "Read OrderNote for Order in own Organization",
					operation: "SELECT",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" WHERE "Order".id = "OrderNote"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
				},
				updateWithOwnOrgOrder: {
					description: "Update OrderNote for Order in own Organization",
					operation: "UPDATE",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" WHERE "Order".id = "OrderNote"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
				},
				deleteWithOwnOrgOrder: {
					description: "Update OrderNote for Order in own Organization",
					operation: "UPDATE",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" WHERE "Order".id = "OrderNote"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
				},
			},
			Organization: {
				readOwnOrg: {
					description: "Read own organization",
					operation: "SELECT",
					expression: (_client, _row, context) => {
						return {
							id: context(user_org_setting),
						};
					},
				},
			},
			PackageSet: {
				readInOwnOrg: {
					description: "Read PackageSet in own organization",
					expression: expressions.hasOrganizationId("PackageSet"),
					operation: "SELECT",
				},
				readWithNoOrg: {
					description: "Read universal PackageSet",
					expression: `"organizationId" IS NULL`,
					operation: "SELECT",
				},
			},
			Disclosure: {},
			DisclosureAcceptance: {
				readWithOwnUser: {
					description: "Read DisclosureAcceptance using own userId",
					operation: "SELECT",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				createWithOwnUser: {
					description: "Create DisclosureAcceptance using own userId",
					operation: "INSERT",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				updateWithOwnUser: {
					description: "Update DisclosureAcceptance using own userId",
					operation: "UPDATE",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
			},
			RequestedSearch: {
				createWithOwnOrgOrder: {
					description: "Create RequestedSearch for Order in own Organization",
					operation: "INSERT",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" WHERE "Order".id = "RequestedSearch"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
				},
				readWithOwnOrgOrder: {
					description: "Read RequestedSearch for Order in own Organization",
					operation: "SELECT",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" WHERE "Order".id = "RequestedSearch"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
				},
			},
			Result: {
				readWithOwnOrgOrder: {
					description: "Read RequestedSearch for Order in own Organization",
					operation: "SELECT",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" WHERE "Order".id = "Result"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
				},
				updateWithOwnOrgOrder: {
					description: "Update RequestedSearch for Order in own Organization",
					operation: "UPDATE",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" WHERE "Order".id = "Result"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
				},
			},
			ResultRevision: {
				readWithOwnOrgOrder: {
					description:
						"Read ResultRevision attached to Result for Order in own Organization",
					operation: "SELECT",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" JOIN "Result" ON "Result"."id" = "ResultRevision"."resultId" WHERE "Order".id = "Result"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
				},
			},
			ResultType: {},
			SearchType: {},
			ShareOrderRecord: {
				createWithOwnUser: {
					description: "Create ShareOrderRecord with own userId",
					operation: "INSERT",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				readWithOwnUser: {
					description: "Read ShareOrderRecord with own userId",
					operation: "SELECT",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				updateWithOwnUser: {
					description: "Update ShareOrderRecord with own userId",
					operation: "UPDATE",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				deleteWithOwnUser: {
					description: "Delete ShareOrderRecord with own userId",
					operation: "DELETE",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				createWithOwnOrgOrder: {
					description: "Create ShareOrderRecord for Order in own Organization",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" WHERE "Order".id = "ShareOrderRecord"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
					operation: "INSERT",
				},
				readWithOwnOrgOrder: {
					description: "Read ShareOrderRecord for Order in own Organization",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" WHERE "Order".id = "ShareOrderRecord"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
					operation: "SELECT",
				},
				updateWithOwnOrgOrder: {
					description: "Update ShareOrderRecord for Order in own Organization",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" WHERE "Order".id = "ShareOrderRecord"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
					operation: "UPDATE",
				},
				deleteWithOwnOrgOrder: {
					description: "Delete ShareOrderRecord for Order in own Organization",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" WHERE "Order".id = "ShareOrderRecord"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
					operation: "DELETE",
				},
			},
			User: {
				readOwnUser: {
					description: "Read own user",
					expression: `current_setting('${user_id_setting}') = "id"`,
					operation: "SELECT",
				},
				updateOwnUser: {
					description: "Update own user",
					expression: `current_setting('${user_id_setting}') = "id"`,
					operation: "UPDATE",
				},
			},
			StateIdentificationCard: {
				createWithOwnUser: {
					description: "Create StateIdentificationCard with own userId",
					operation: "INSERT",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				readWithOwnUser: {
					description: "Read StateIdentificationCard with own userId",
					operation: "SELECT",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				updateWithOwnUser: {
					description: "Update StateIdentificationCard with own userId",
					operation: "UPDATE",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
			},
			Passport: {
				createWithOwnUser: {
					description: "Create Passport with own userId",
					operation: "INSERT",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				readWithOwnUser: {
					description: "Read Passport with own userId",
					operation: "SELECT",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				updateWithOwnUser: {
					description: "Update Passport with own userId",
					operation: "UPDATE",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
			},
			Vendor: {},
			vIDVoucher: {
				readOwnUser: {
					description: "Read own user",
					operation: "SELECT",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				readOwnUserEmail: {
					description: "Read own user email",
					expression: expressions.hasUserEmail("vIDVoucher"),
					operation: "SELECT",
				},
				createInOwnOrg: {
					description: "Create vIDVoucher in own Organization",
					expression: expressions.hasOrganizationId("vIDVoucher"),
					operation: "INSERT",
				},
				readInOwnOrg: {
					description: "Read vIDVoucher in own organization",
					expression: expressions.hasOrganizationId("vIDVoucher"),
					operation: "SELECT",
				},
				updateInOwnOrg: {
					description: "Update vIDVoucher in own Organization",
					expression: expressions.hasOrganizationId("vIDVoucher"),
					operation: "UPDATE",
				},
				deleteInOwnOrg: {
					description: "Delete vIDVoucher in own Organization",
					expression: expressions.hasOrganizationId("vIDVoucher"),
					operation: "DELETE",
				},
			},
			HighlySensitiveIdentifier: {
				createWithOwnOrgOrder: {
					description: "Create HSI attached to Order in own Organization",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" JOIN "ApplicantData" on "ApplicantData"."id" = "applicantDataId" WHERE "Order".id = "ApplicantData"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
					operation: "INSERT",
				},
				readWithOwnOrgOrder: {
					description: "Read HSI attached to Order in own Organization",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" JOIN "ApplicantData" on "ApplicantData"."id" = "HighlySensitiveIdentifier"."applicantDataId" WHERE "Order".id = "ApplicantData"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
					operation: "SELECT",
				},
				updateWithOwnOrgOrder: {
					description: "Update HSI attached to Order in own Organization",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" JOIN "ApplicantData" on "ApplicantData"."id" = "applicantDataId" WHERE "Order".id = "ApplicantData"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
					operation: "UPDATE",
				},
				deleteWithOwnOrgOrder: {
					description: "Delete HSI attached to Order in own Organization",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" JOIN "ApplicantData" on "ApplicantData"."id" = "applicantDataId" WHERE "Order".id = "ApplicantData"."orderId" AND ${expressions.hasOrganizationId(
						"Order",
					)})`,
					operation: "DELETE",
				},
				createWithOwnOrder: {
					description: "Create HSI attached to own Order",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" JOIN "ApplicantData" on "ApplicantData"."id" = "applicantDataId" WHERE "Order".id = "ApplicantData"."orderId" AND current_setting('${user_id_setting}') = "Order"."userId")`,
					operation: "INSERT",
				},
				readWithOwnOrder: {
					description: "Read HSI attached to own Order",
					expression: `EXISTS(SELECT "Order"."id" FROM "Order" JOIN "ApplicantData" on "ApplicantData"."id" = "HighlySensitiveIdentifier"."applicantDataId" WHERE "Order".id = "ApplicantData"."orderId" AND current_setting('${user_id_setting}') = "Order"."userId")`,
					operation: "SELECT",
				},
				createWithOwnUser: {
					description: "Create HSI with own userId",
					operation: "INSERT",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				readWithOwnUser: {
					description: "Read HSI with own userId",
					operation: "SELECT",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				updateWithOwnUser: {
					description: "Update HSI with own userId",
					operation: "UPDATE",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
				deleteWithOwnUser: {
					description: "Delete HSI with own userId",
					operation: "DELETE",
					expression: (_client, _row, context) => ({
						userId: context(user_id_setting),
					}),
				},
			},
			ReportableIdVerificationResult: {
				createWithOwnOrgOrder: {
					description:
						"Create ReportableIdVerificationResult attached to Order in own Organization",
					expression: `
          EXISTS(
            SELECT "Order"."id" 
            FROM "Order" 
            WHERE "Order".id = "orderId" AND ${expressions.hasOrganizationId(
							"Order",
						)}
          )`,
					operation: "INSERT",
				},
				readWithOwnOrgOrder: {
					description:
						"Read ReportableIdVerificationResult attached to Order in own Organization",
					expression: `
          EXISTS(
            SELECT "Order"."id" 
            FROM "Order" 
            WHERE "Order".id = "orderId" AND ${expressions.hasOrganizationId(
							"Order",
						)}
          )`,
					operation: "SELECT",
				},
				updateWithOwnOrgOrder: {
					description:
						"Read ReportableIdVerificationResult attached to Order in own Organization",
					expression: `
          EXISTS(
            SELECT "Order"."id" 
            FROM "Order" 
            WHERE "Order".id = "orderId" AND ${expressions.hasOrganizationId(
							"Order",
						)}
          )`,
					operation: "UPDATE",
				},
			},
		},
		getRoles: (abilities) => {
			return {
				SUPER_ADMIN: "*",
				INTEGRATION_ADMIN: [
					abilities.Address.createWithOwnOrgOrder,
					abilities.Address.readWithOwnOrgOrder,
					abilities.ApplicantData.createWithOwnOrgOrder,
					abilities.ApplicantData.readWithOwnOrgOrder,
					abilities.Beam.createWithOwnOrg,
					abilities.Beam.readWithOwnOrg,
					abilities.Beam.updateWithOwnOrg,
					abilities.Beam.deleteWithOwnOrg,
					abilities.Credential.createWithOwnOrg,
					abilities.Credential.readWithOwnOrg,
					abilities.CredentialStatus.createWithOwnOrg,
					abilities.CredentialStatus.read,
					abilities.CredentialStatus.updateWithOwnOrg,
					abilities.CredentialType.createWithOwnOrg,
					abilities.CredentialType.readWithOwnOrg,
					abilities.DispatchedSearch.readWithOwnOrgOrder,
					abilities.File.createWithOwnOrgOrder,
					abilities.File.readWithOwnOrgOrder,
					abilities.File.updateWithOwnOrgOrder,
					abilities.File.deleteWithOwnOrgOrder,
					abilities.BeamInput.createWithOwnOrg,
					abilities.BeamInput.readWithOwnOrg,
					abilities.BeamInputType.createWithOwnOrg,
					abilities.BeamInputType.readWithOwnOrg,
					abilities.Name.createWithOwnOrgOrder,
					abilities.Name.readWithOwnOrgOrder,
					abilities.Name.updateWithOwnOrgOrder,
					abilities.Name.deleteWithOwnOrgOrder,
					abilities.Order.create,
					abilities.Order.createInOwnOrg,
					abilities.Order.readInOwnOrg,
					abilities.Order.updateInOwnOrg,
					abilities.OrderNote.createWithOwnOrgOrder,
					abilities.OrderNote.readWithOwnOrgOrder,
					abilities.OrderNote.updateWithOwnOrgOrder,
					abilities.OrderNote.deleteWithOwnOrgOrder,
					abilities.Organization.readOwnOrg,
					abilities.PackageSet.readInOwnOrg,
					abilities.RequestedSearch.createWithOwnOrgOrder,
					abilities.RequestedSearch.readWithOwnOrgOrder,
					abilities.ResultType.read,
					abilities.SearchType.read,
					abilities.ShareOrderRecord.createWithOwnOrgOrder,
					abilities.ShareOrderRecord.readWithOwnOrgOrder,
					abilities.ShareOrderRecord.updateWithOwnOrgOrder,
					abilities.ShareOrderRecord.deleteWithOwnOrgOrder,
					abilities.User.read,
					abilities.User.update,
					abilities.Vendor.read,
					abilities.vIDVoucher.createInOwnOrg,
					abilities.vIDVoucher.readInOwnOrg,
					abilities.vIDVoucher.updateInOwnOrg,
					abilities.vIDVoucher.deleteInOwnOrg,
					abilities.HighlySensitiveIdentifier.createWithOwnOrgOrder,
					abilities.HighlySensitiveIdentifier.readWithOwnOrgOrder,
					abilities.HighlySensitiveIdentifier.updateWithOwnOrgOrder,
					abilities.HighlySensitiveIdentifier.deleteWithOwnOrgOrder,
					abilities.ReportableIdVerificationResult.createWithOwnOrgOrder,
					abilities.ReportableIdVerificationResult.readWithOwnOrgOrder,
					abilities.ReportableIdVerificationResult.updateWithOwnOrgOrder,
				],
				ORGANIZATION_ADMIN: [
					abilities.Address.createWithOwnOrgOrder,
					abilities.Address.readWithOwnOrgOrder,
					abilities.ApplicantData.createWithOwnOrgOrder,
					abilities.ApplicantData.readWithOwnOrgOrder,
					abilities.Beam.createWithOwnOrg,
					abilities.Beam.readWithOwnOrg,
					abilities.Beam.updateWithOwnOrg,
					abilities.Beam.deleteWithOwnOrg,
					abilities.Credential.createWithOwnOrg,
					abilities.Credential.readWithOwnOrg,
					abilities.CredentialStatus.createWithOwnOrg,
					abilities.CredentialStatus.read,
					abilities.CredentialStatus.updateWithOwnOrg,
					abilities.CredentialType.createWithOwnOrg,
					abilities.CredentialType.readWithOwnOrg,
					abilities.Disclosure.read,
					abilities.DispatchedSearch.readWithOwnOrgOrder,
					abilities.BeamInput.createWithOwnOrg,
					abilities.BeamInput.readWithOwnOrg,
					abilities.BeamInputType.createWithOwnOrg,
					abilities.BeamInputType.readWithOwnOrg,
					abilities.File.createWithOwnOrgOrder,
					abilities.File.readWithOwnOrgOrder,
					abilities.File.updateWithOwnOrgOrder,
					abilities.File.deleteWithOwnOrgOrder,
					abilities.Name.createWithOwnOrgOrder,
					abilities.Name.readWithOwnOrgOrder,
					abilities.Name.updateWithOwnOrgOrder,
					abilities.Name.deleteWithOwnOrgOrder,
					abilities.Order.create,
					abilities.Order.createInOwnOrg,
					abilities.Order.readInOwnOrg,
					abilities.Order.updateInOwnOrg,
					abilities.OrderNote.createWithOwnOrgOrder,
					abilities.OrderNote.readWithOwnOrgOrder,
					abilities.OrderNote.updateWithOwnOrgOrder,
					abilities.OrderNote.deleteWithOwnOrgOrder,
					abilities.Organization.readOwnOrg,
					abilities.PackageSet.readInOwnOrg,
					abilities.RequestedSearch.createWithOwnOrgOrder,
					abilities.RequestedSearch.readWithOwnOrgOrder,
					abilities.ResultType.read,
					abilities.SearchType.read,
					abilities.ShareOrderRecord.createWithOwnOrgOrder,
					abilities.ShareOrderRecord.readWithOwnOrgOrder,
					abilities.ShareOrderRecord.updateWithOwnOrgOrder,
					abilities.ShareOrderRecord.deleteWithOwnOrgOrder,
					abilities.User.read,
					abilities.User.update,
					abilities.Vendor.read,
					abilities.vIDVoucher.createInOwnOrg,
					abilities.vIDVoucher.readInOwnOrg,
					abilities.vIDVoucher.updateInOwnOrg,
					abilities.vIDVoucher.deleteInOwnOrg,
					abilities.HighlySensitiveIdentifier.createWithOwnOrgOrder,
					abilities.HighlySensitiveIdentifier.readWithOwnOrgOrder,
					abilities.HighlySensitiveIdentifier.updateWithOwnOrgOrder,
					abilities.HighlySensitiveIdentifier.deleteWithOwnOrgOrder,
					abilities.ReportableIdVerificationResult.createWithOwnOrgOrder,
					abilities.ReportableIdVerificationResult.readWithOwnOrgOrder,
					abilities.ReportableIdVerificationResult.updateWithOwnOrgOrder,
				],
				PROCESSOR: [abilities.User.readOwnUser, abilities.User.updateOwnUser],
				USER: [
					abilities.Address.createWithOwnUser,
					abilities.Address.readWithOwnUser,
					abilities.Address.updateWithOwnUser,
					abilities.Address.deleteWithOwnUser,
					abilities.Address.createWithOwnOrder,
					abilities.Address.readWithOwnOrder,
					abilities.ApplicantData.createWithOwnUser,
					abilities.ApplicantData.readWithOwnUser,
					abilities.ApplicantData.updateWithOwnUser,
					abilities.Beam.readWithOwnOrg,
					abilities.ComplianceLetter.readWithOwnUser,
					abilities.Credential.readWithOwnUser,
					abilities.CredentialType.readWithOwnUser,
					abilities.CredentialStatus.read,
					abilities.LegacyCredential.readWithOwnUser,
					abilities.Disclosure.read,
					abilities.DisclosureAcceptance.readWithOwnUser,
					abilities.DisclosureAcceptance.createWithOwnUser,
					abilities.DisclosureAcceptance.updateWithOwnUser,
					abilities.File.readWithOwnUser,
					abilities.File.createWithOwnUser,
					abilities.File.readOwnSelfie,
					abilities.File.updateOwnSelfie,
					abilities.File.createOwnSelfie,
					abilities.File.readOwnFrontId,
					abilities.File.updateOwnFrontId,
					abilities.File.createOwnFrontId,
					abilities.File.readOwnBackId,
					abilities.File.updateOwnBackId,
					abilities.File.createOwnBackId,
					abilities.BeamInput.createWithOwnUser,
					abilities.BeamInput.readWithOwnUser,
					abilities.BeamInputType.readWithOwnOrg,
					abilities.Name.createWithOwnUser,
					abilities.Name.readWithOwnUser,
					abilities.Name.updateWithOwnUser,
					abilities.Name.createWithOwnOrder,
					abilities.Name.readWithOwnOrder,
					abilities.Order.readWithOwnUser,
					abilities.Order.createWithOwnUser,
					abilities.OrderNote.createWithOwnUser,
					abilities.OrderNote.readWithOwnUser,
					abilities.Organization.readOwnOrg,
					abilities.PackageSet.readInOwnOrg,
					abilities.PackageSet.readWithNoOrg,
					abilities.SearchType.read,
					abilities.ShareOrderRecord.readWithOwnUser,
					abilities.ShareOrderRecord.createWithOwnUser,
					abilities.ShareOrderRecord.updateWithOwnUser,
					abilities.ShareOrderRecord.deleteWithOwnUser,
					abilities.User.readOwnUser,
					abilities.User.updateOwnUser,
					abilities.vIDVoucher.readOwnUser,
					abilities.vIDVoucher.readOwnUserEmail,
					abilities.HighlySensitiveIdentifier.createWithOwnUser,
					abilities.HighlySensitiveIdentifier.readWithOwnUser,
					abilities.HighlySensitiveIdentifier.updateWithOwnUser,
					abilities.HighlySensitiveIdentifier.createWithOwnOrder,
					abilities.HighlySensitiveIdentifier.readWithOwnOrder,
					abilities.StateIdentificationCard.createWithOwnUser,
					abilities.StateIdentificationCard.readWithOwnUser,
					abilities.StateIdentificationCard.updateWithOwnUser,
					abilities.Passport.createWithOwnUser,
					abilities.Passport.readWithOwnUser,
					abilities.Passport.updateWithOwnUser,
					abilities.Address.createWithOwnStateIdentificationCard,
					abilities.Address.readWithOwnStateIdentificationCard,
					abilities.Address.createWithOwnPassport,
					abilities.Address.readWithOwnPassport,
					abilities.Name.createWithOwnStateIdentificationCard,
					abilities.Name.readWithOwnStateIdentificationCard,
					abilities.Name.createWithOwnPassport,
					abilities.Name.readWithOwnPassport,
					abilities.File.createWithOwnStateIdentificationCard,
					abilities.File.readWithOwnStateIdentificationCard,
					abilities.File.updateWithOwnStateIdentificationCard,
					abilities.File.createWithOwnPassport,
					abilities.File.readWithOwnPassport,
					abilities.File.updateWithOwnPassport,
				],
			};
		},
		getContext: () => {
			return null;
		},
		options: {
			txMaxWait: 30000,
			txTimeout: 30000,
		},
	});

	console.log("client configured");

	return client as PrismaClient;
};

const run = async () => {
	console.log("starting");
	const prisma = new PrismaClient();
	const start = performance.now();
	const client = await configureRls(prisma);
	console.log("got client");
	const end = performance.now();
	console.log("done in", end - start, "ms");
};

run();
