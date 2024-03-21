-- CreateEnum
CREATE TYPE "UserStatusEnum" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING');

-- CreateEnum
CREATE TYPE "AttachmentEnum" AS ENUM ('LETTER_613', 'LETTER_AA', 'LETTER_PAA');

-- CreateEnum
CREATE TYPE "OrgRelationTypeEnum" AS ENUM ('CRA');

-- CreateEnum
CREATE TYPE "NameTypeEnum" AS ENUM ('PRIMARY', 'ALIAS');

-- CreateEnum
CREATE TYPE "AddressTypeEnum" AS ENUM ('PRIMARY', 'FORMER');

-- CreateEnum
CREATE TYPE "OrderDeliveryMethod" AS ENUM ('rapidRequest', 'vidScreen', 'standard');

-- CreateEnum
CREATE TYPE "OrderAlertEnum" AS ENUM ('ALERTS_FOUND', 'NO_ALERTS_FOUND');

-- CreateEnum
CREATE TYPE "OrderStatusEnum" AS ENUM ('PENDING', 'COMPLETE');

-- CreateEnum
CREATE TYPE "OrderScoreEnum" AS ENUM ('CLIENT_REVIEW', 'NO_ALERTS', 'ON_HOLD', 'ADVERSE_ACTION', 'REVIEW_REQUIRED', 'WITHDRAWN', 'ID_VERIFIED', 'ID_NOT_VERIFIED', 'ALERTS_FOUND', 'PENDING', 'PRE_ADVERSE', 'NO_DRUG_TEST');

-- CreateEnum
CREATE TYPE "JobStatusEnum" AS ENUM ('PENDING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "CurrencyTypeEnum" AS ENUM ('USD', 'CAD', 'GBP', 'EUR');

-- CreateEnum
CREATE TYPE "CurrencyMultiplierEnum" AS ENUM ('ZERO_DECIMALS', 'TWO_DECIMALS', 'FOUR_DECIMALS', 'SIX_DECIMALS');

-- CreateEnum
CREATE TYPE "VoucherStatusEnum" AS ENUM ('PENDING', 'COMPLETE', 'OPT_OUT');

-- CreateEnum
CREATE TYPE "UserPrimaryContactEnum" AS ENUM ('EMAIL', 'PHONE');

-- CreateEnum
CREATE TYPE "FilePurposeTypeEnum" AS ENUM ('SIGNATURE', 'STATE_ID_CARD');

-- CreateEnum
CREATE TYPE "SearchStatusTypeEnum" AS ENUM ('DISPATCHED', 'ERROR', 'RETURNED');

-- CreateEnum
CREATE TYPE "ResultAlertTypeEnum" AS ENUM ('ALERTS_FOUND', 'NO_ALERTS_FOUND', 'COMPLIANCE_REVIEW');

-- CreateEnum
CREATE TYPE "ResultSearchType" AS ENUM ('natcrim_alias', 'natcrim', 'county', 'ssn_alias', 'ssn_validation', 'ssn_alert', 'youth', 'sanctions', 'sexoffender', 'standard_id_verification');

-- CreateEnum
CREATE TYPE "LocationTypeEnum" AS ENUM ('CITY', 'COUNTY', 'STATE');

-- CreateEnum
CREATE TYPE "DisclosureTypeEnum" AS ENUM ('LOCATION_BASED', 'GENERAL', 'CUSTOM', 'ORGANIZATION', 'CRA', 'PACKAGE');

-- CreateEnum
CREATE TYPE "HighlySensitiveIdentifierType" AS ENUM ('SSN', 'PASSPORT');

-- CreateEnum
CREATE TYPE "ProcessorEnum" AS ENUM ('MANUAL', 'CANARY', 'TAZWORKS');

-- CreateEnum
CREATE TYPE "BeamRunStatusEnum" AS ENUM ('PENDING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "CredentialStatusEnum" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "User" (
    "email" TEXT NOT NULL,
    "name" TEXT,
    "id" TEXT NOT NULL,
    "dob" TEXT,
    "legacySSN" TEXT,
    "phone" TEXT,
    "gender" TEXT,
    "jobTitle" TEXT DEFAULT '',
    "pushTokens" TEXT[],
    "onboardingStep" TEXT DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "consumerReportingAgencyId" TEXT,
    "status" "UserStatusEnum" NOT NULL DEFAULT 'PENDING',
    "organizationIds" TEXT[],

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleAssignment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "title" VARCHAR(255) NOT NULL,
    "authorId" TEXT,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" SERIAL NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "SKU" TEXT,
    "stock" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hat" (
    "id" SERIAL NOT NULL,
    "style" TEXT,
    "userId" TEXT,

    CONSTRAINT "Hat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" SERIAL NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "email" TEXT NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceLetter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AttachmentEnum" NOT NULL,
    "orderId" TEXT NOT NULL,
    "lastViewedDate" TIMESTAMP(3),
    "sentDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationRelation" (
    "id" TEXT NOT NULL,
    "primaryOrgId" TEXT NOT NULL,
    "affiliateOrgId" TEXT NOT NULL,
    "type" "OrgRelationTypeEnum" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Name" (
    "id" TEXT NOT NULL,
    "firstName" TEXT,
    "middleName" TEXT,
    "lastName" TEXT,
    "suffix" TEXT,
    "type" "NameTypeEnum",
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "applicantDataId" TEXT,
    "stateIdentificationCardId" TEXT,
    "passportId" TEXT,

    CONSTRAINT "Name_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacyCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT,
    "data" JSONB,
    "validatorHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegacyCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "addressLineOne" TEXT NOT NULL DEFAULT '',
    "addressLineTwo" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'United States',
    "type" "AddressTypeEnum",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT,
    "applicantDataId" TEXT,
    "stateIdentificationCardId" TEXT,
    "passportId" TEXT,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "fileNumber" TEXT NOT NULL,
    "createdById" TEXT,
    "userId" TEXT,
    "deliveryMethod" "OrderDeliveryMethod",
    "status" "OrderStatusEnum" DEFAULT 'PENDING',
    "score" "OrderScoreEnum",
    "alert" "OrderAlertEnum",
    "amount" DOUBLE PRECISION NOT NULL,
    "paid" BOOLEAN NOT NULL,
    "flagged" BOOLEAN,
    "organizationId" TEXT,
    "parentOrganizationId" TEXT,
    "reportableResults" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reportedAt" TIMESTAMP(3),
    "postbackWebhookUrl" TEXT,
    "additionalMetadata" JSONB,
    "internalMetadata" JSONB,
    "optOut" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN DEFAULT false,
    "reportCompletedAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicantData" (
    "id" TEXT NOT NULL,
    "dateOfBirth" TEXT NOT NULL,
    "legacySSN" TEXT NOT NULL,
    "email" TEXT,
    "phoneNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderId" TEXT NOT NULL,
    "applicantIDCardId" TEXT,

    CONSTRAINT "ApplicantData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StateIdentificationCard" (
    "id" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "dateOfBirth" TEXT NOT NULL,
    "issueDate" TEXT NOT NULL,
    "expiryDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicantDataId" TEXT,
    "userId" TEXT,
    "manualIdEntry" BOOLEAN DEFAULT false,

    CONSTRAINT "StateIdentificationCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Passport" (
    "id" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "passportNumber" TEXT NOT NULL,
    "nationality" TEXT NOT NULL,
    "dateOfBirth" TEXT NOT NULL,
    "issueDate" TEXT NOT NULL,
    "expiryDate" TEXT NOT NULL,
    "placeOfBirth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicantDataId" TEXT,
    "userId" TEXT,

    CONSTRAINT "Passport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "status" "JobStatusEnum" DEFAULT 'PENDING',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicantIDCard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "county" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicantIDCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderNote" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "type" TEXT NOT NULL,
    "isActive" BOOLEAN DEFAULT true,
    "createdById" TEXT,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareOrderRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareOrderRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageSet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "description" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "currency" "CurrencyTypeEnum" NOT NULL DEFAULT 'USD',
    "amountPrecision" "CurrencyMultiplierEnum" NOT NULL DEFAULT 'SIX_DECIMALS',
    "isActive" BOOLEAN DEFAULT true,
    "showDisclosures" BOOLEAN DEFAULT true,
    "oneAndDone" BOOLEAN DEFAULT false,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "packageSetTypeId" TEXT,
    "postbackWebhookUrl" TEXT,
    "metadata" JSONB,
    "collectSSN" BOOLEAN DEFAULT true,

    CONSTRAINT "PackageSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageSetType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageSetType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vIDVoucher" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "firstName" TEXT,
    "middleName" TEXT,
    "lastName" TEXT,
    "suffix" TEXT,
    "dateOfBirth" TEXT,
    "primaryContactMethod" "UserPrimaryContactEnum" DEFAULT 'EMAIL',
    "branchIOShortCode" TEXT,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "inviteId" TEXT,
    "postbackUrl" TEXT,
    "clientMetadata" JSONB,
    "status" "VoucherStatusEnum" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "packageSetId" TEXT NOT NULL,
    "orderId" TEXT,
    "userId" TEXT,

    CONSTRAINT "vIDVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "bucket" TEXT,
    "key" TEXT,
    "region" TEXT,
    "purpose" "FilePurposeTypeEnum",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN DEFAULT true,
    "orderId" TEXT,
    "selfieUserId" TEXT,
    "frontIdUserId" TEXT,
    "backIdUserId" TEXT,
    "stateIdentificationCardSelfieId" TEXT,
    "stateIdentificationCardFrontId" TEXT,
    "stateIdentificationCardBackId" TEXT,
    "stateIdentificationCardExtractId" TEXT,
    "passportCardSelfieId" TEXT,
    "passportFrontId" TEXT,
    "passportExtractPhotoId" TEXT,
    "disclosureAcceptanceId" TEXT,
    "beamInputId" TEXT,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dataStructure" JSONB NOT NULL,
    "cra" TEXT,
    "vendorBehaviour" TEXT,
    "vendors" TEXT,

    CONSTRAINT "SearchType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dataStructure" JSONB NOT NULL,
    "cra" TEXT,

    CONSTRAINT "ResultType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestedSearch" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "blob" JSONB NOT NULL,
    "status" "SearchStatusTypeEnum" NOT NULL,
    "searchTypeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,

    CONSTRAINT "RequestedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchedSearch" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "SearchStatusTypeEnum" NOT NULL,
    "metadata" JSONB,
    "orderId" TEXT NOT NULL,
    "searchTypeId" TEXT NOT NULL,
    "requestedSearchId" TEXT NOT NULL,

    CONSTRAINT "DispatchedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Result" (
    "id" TEXT NOT NULL,
    "blob" JSONB,
    "normalized" JSONB,
    "searchType" "ResultSearchType",
    "alert" "ResultAlertTypeEnum",
    "detail" TEXT NOT NULL DEFAULT '',
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ssn" TEXT,
    "sexOffender" BOOLEAN,
    "vendorId" TEXT,
    "requestedSearchId" TEXT,

    CONSTRAINT "Result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultRevision" (
    "id" TEXT NOT NULL,
    "blob" JSONB,
    "userId" TEXT NOT NULL,
    "resultId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResultRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Disclosure" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "DisclosureTypeEnum" NOT NULL,
    "locationType" "LocationTypeEnum",
    "location" TEXT,
    "organizationId" TEXT,
    "craId" TEXT,

    CONSTRAINT "Disclosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisclosureAcceptance" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT,
    "userId" TEXT NOT NULL,
    "signatureSvg" BYTEA NOT NULL,

    CONSTRAINT "DisclosureAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HighlySensitiveIdentifier" (
    "id" TEXT NOT NULL,
    "type" "HighlySensitiveIdentifierType" NOT NULL,
    "value" TEXT NOT NULL,
    "applicantDataId" TEXT,
    "userId" TEXT,
    "beamInputId" TEXT,

    CONSTRAINT "HighlySensitiveIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportableIdVerificationResult" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT NOT NULL,
    "idScanBiometricMatch" BOOLEAN NOT NULL,
    "idScanData" JSONB NOT NULL,
    "applicantAliasDataId" TEXT,

    CONSTRAINT "ReportableIdVerificationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Beam" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "triggeredByPackageSetId" TEXT,
    "processor" "ProcessorEnum" NOT NULL DEFAULT 'MANUAL',
    "processorConfig" JSONB,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Beam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeamInputType" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "schema" JSONB NOT NULL,
    "beamId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeamInputType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeamInput" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "BeamInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeamRun" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "inputId" TEXT NOT NULL,
    "credentialId" TEXT,
    "clientReference" TEXT,
    "integrationJob" TEXT,
    "status" "BeamRunStatusEnum" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "error" JSONB,

    CONSTRAINT "BeamRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schema" JSONB NOT NULL,
    "organizationId" TEXT,
    "beamId" TEXT NOT NULL,

    CONSTRAINT "CredentialType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "typeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inputId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialStatus" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "value" "CredentialStatusEnum" NOT NULL,
    "credentialId" TEXT NOT NULL,

    CONSTRAINT "CredentialStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PostToTag" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "_OrderToPackageSet" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_PackageSetToSearchType" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_PackageSetTypeToSearchType" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_ResultTypeToSearchType" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_DisclosureToPackageSet" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_DisclosureToDisclosureAcceptance" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_shortName_key" ON "Organization"("shortName");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Hat_userId_key" ON "Hat"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_email_key" ON "Account"("email");

-- CreateIndex
CREATE INDEX "ComplianceLetter_createdAt_id_idx" ON "ComplianceLetter"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ComplianceLetter_orderId_idx" ON "ComplianceLetter"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationRelation_primaryOrgId_affiliateOrgId_key" ON "OrganizationRelation"("primaryOrgId", "affiliateOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "Name_stateIdentificationCardId_key" ON "Name"("stateIdentificationCardId");

-- CreateIndex
CREATE UNIQUE INDEX "Name_passportId_key" ON "Name"("passportId");

-- CreateIndex
CREATE INDEX "Name_createdAt_id_idx" ON "Name"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Name_userId_idx" ON "Name"("userId");

-- CreateIndex
CREATE INDEX "Name_applicantDataId_idx" ON "Name"("applicantDataId");

-- CreateIndex
CREATE INDEX "LegacyCredential_createdAt_id_idx" ON "LegacyCredential"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "LegacyCredential_userId_idx" ON "LegacyCredential"("userId");

-- CreateIndex
CREATE INDEX "LegacyCredential_organizationId_idx" ON "LegacyCredential"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Address_stateIdentificationCardId_key" ON "Address"("stateIdentificationCardId");

-- CreateIndex
CREATE UNIQUE INDEX "Address_passportId_key" ON "Address"("passportId");

-- CreateIndex
CREATE INDEX "Address_createdAt_id_idx" ON "Address"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Address_userId_idx" ON "Address"("userId");

-- CreateIndex
CREATE INDEX "Address_applicantDataId_idx" ON "Address"("applicantDataId");

-- CreateIndex
CREATE INDEX "Address_stateIdentificationCardId_idx" ON "Address"("stateIdentificationCardId");

-- CreateIndex
CREATE INDEX "Address_passportId_idx" ON "Address"("passportId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_fileNumber_key" ON "Order"("fileNumber");

-- CreateIndex
CREATE INDEX "Order_createdAt_id_idx" ON "Order"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Order_organizationId_idx" ON "Order"("organizationId");

-- CreateIndex
CREATE INDEX "Order_createdById_idx" ON "Order"("createdById");

-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicantData_orderId_key" ON "ApplicantData"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicantData_applicantIDCardId_key" ON "ApplicantData"("applicantIDCardId");

-- CreateIndex
CREATE INDEX "ApplicantData_createdAt_id_idx" ON "ApplicantData"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ApplicantData_orderId_idx" ON "ApplicantData"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "StateIdentificationCard_applicantDataId_key" ON "StateIdentificationCard"("applicantDataId");

-- CreateIndex
CREATE INDEX "StateIdentificationCard_createdAt_id_idx" ON "StateIdentificationCard"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "StateIdentificationCard_userId_idx" ON "StateIdentificationCard"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Passport_applicantDataId_key" ON "Passport"("applicantDataId");

-- CreateIndex
CREATE INDEX "Passport_createdAt_id_idx" ON "Passport"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Passport_userId_idx" ON "Passport"("userId");

-- CreateIndex
CREATE INDEX "Job_createdAt_id_idx" ON "Job"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ApplicantIDCard_createdAt_id_idx" ON "ApplicantIDCard"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "OrderNote_createdAt_id_idx" ON "OrderNote"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "OrderNote_orderId_idx" ON "OrderNote"("orderId");

-- CreateIndex
CREATE INDEX "OrderNote_createdById_idx" ON "OrderNote"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "ShareOrderRecord_orderId_key" ON "ShareOrderRecord"("orderId");

-- CreateIndex
CREATE INDEX "ShareOrderRecord_createdAt_id_idx" ON "ShareOrderRecord"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ShareOrderRecord_userId_idx" ON "ShareOrderRecord"("userId");

-- CreateIndex
CREATE INDEX "ShareOrderRecord_organizationId_idx" ON "ShareOrderRecord"("organizationId");

-- CreateIndex
CREATE INDEX "PackageSet_createdAt_id_idx" ON "PackageSet"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "PackageSet_organizationId_idx" ON "PackageSet"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PackageSet_name_organizationId_key" ON "PackageSet"("name", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PackageSet_shortName_organizationId_key" ON "PackageSet"("shortName", "organizationId");

-- CreateIndex
CREATE INDEX "PackageSetType_createdAt_id_idx" ON "PackageSetType"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "vIDVoucher_orderId_key" ON "vIDVoucher"("orderId");

-- CreateIndex
CREATE INDEX "vIDVoucher_createdAt_id_idx" ON "vIDVoucher"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "vIDVoucher_email_idx" ON "vIDVoucher"("email");

-- CreateIndex
CREATE INDEX "vIDVoucher_userId_idx" ON "vIDVoucher"("userId");

-- CreateIndex
CREATE INDEX "vIDVoucher_organizationId_idx" ON "vIDVoucher"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "File_selfieUserId_key" ON "File"("selfieUserId");

-- CreateIndex
CREATE UNIQUE INDEX "File_frontIdUserId_key" ON "File"("frontIdUserId");

-- CreateIndex
CREATE UNIQUE INDEX "File_backIdUserId_key" ON "File"("backIdUserId");

-- CreateIndex
CREATE UNIQUE INDEX "File_stateIdentificationCardSelfieId_key" ON "File"("stateIdentificationCardSelfieId");

-- CreateIndex
CREATE UNIQUE INDEX "File_stateIdentificationCardFrontId_key" ON "File"("stateIdentificationCardFrontId");

-- CreateIndex
CREATE UNIQUE INDEX "File_stateIdentificationCardBackId_key" ON "File"("stateIdentificationCardBackId");

-- CreateIndex
CREATE UNIQUE INDEX "File_stateIdentificationCardExtractId_key" ON "File"("stateIdentificationCardExtractId");

-- CreateIndex
CREATE UNIQUE INDEX "File_passportCardSelfieId_key" ON "File"("passportCardSelfieId");

-- CreateIndex
CREATE UNIQUE INDEX "File_passportFrontId_key" ON "File"("passportFrontId");

-- CreateIndex
CREATE UNIQUE INDEX "File_passportExtractPhotoId_key" ON "File"("passportExtractPhotoId");

-- CreateIndex
CREATE UNIQUE INDEX "File_disclosureAcceptanceId_key" ON "File"("disclosureAcceptanceId");

-- CreateIndex
CREATE INDEX "File_createdAt_id_idx" ON "File"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "File_orderId_idx" ON "File"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "SearchType_name_key" ON "SearchType"("name");

-- CreateIndex
CREATE INDEX "SearchType_createdAt_id_idx" ON "SearchType"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ResultType_name_key" ON "ResultType"("name");

-- CreateIndex
CREATE INDEX "ResultType_createdAt_id_idx" ON "ResultType"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "RequestedSearch_createdAt_id_idx" ON "RequestedSearch"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "RequestedSearch_orderId_idx" ON "RequestedSearch"("orderId");

-- CreateIndex
CREATE INDEX "RequestedSearch_searchTypeId_idx" ON "RequestedSearch"("searchTypeId");

-- CreateIndex
CREATE INDEX "DispatchedSearch_createdAt_id_idx" ON "DispatchedSearch"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "DispatchedSearch_orderId_idx" ON "DispatchedSearch"("orderId");

-- CreateIndex
CREATE INDEX "Result_createdAt_id_idx" ON "Result"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Result_vendorId_idx" ON "Result"("vendorId");

-- CreateIndex
CREATE INDEX "Result_requestedSearchId_idx" ON "Result"("requestedSearchId");

-- CreateIndex
CREATE INDEX "Result_orderId_idx" ON "Result"("orderId");

-- CreateIndex
CREATE INDEX "ResultRevision_createdAt_id_idx" ON "ResultRevision"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ResultRevision_userId_idx" ON "ResultRevision"("userId");

-- CreateIndex
CREATE INDEX "ResultRevision_resultId_idx" ON "ResultRevision"("resultId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_name_key" ON "Vendor"("name");

-- CreateIndex
CREATE INDEX "Vendor_createdAt_id_idx" ON "Vendor"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Disclosure_createdAt_id_idx" ON "Disclosure"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "DisclosureAcceptance_orderId_key" ON "DisclosureAcceptance"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "DisclosureAcceptance_userId_key" ON "DisclosureAcceptance"("userId");

-- CreateIndex
CREATE INDEX "DisclosureAcceptance_createdAt_id_idx" ON "DisclosureAcceptance"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "HighlySensitiveIdentifier_applicantDataId_key" ON "HighlySensitiveIdentifier"("applicantDataId");

-- CreateIndex
CREATE UNIQUE INDEX "HighlySensitiveIdentifier_userId_key" ON "HighlySensitiveIdentifier"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportableIdVerificationResult_orderId_key" ON "ReportableIdVerificationResult"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportableIdVerificationResult_applicantAliasDataId_key" ON "ReportableIdVerificationResult"("applicantAliasDataId");

-- CreateIndex
CREATE INDEX "ReportableIdVerificationResult_createdAt_id_idx" ON "ReportableIdVerificationResult"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Beam_organizationId_idx" ON "Beam"("organizationId");

-- CreateIndex
CREATE INDEX "BeamInputType_createdAt_id_idx" ON "BeamInputType"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "BeamInputType_slug_version_idx" ON "BeamInputType"("slug", "version");

-- CreateIndex
CREATE INDEX "BeamInputType_organizationId_idx" ON "BeamInputType"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "BeamInputType_slug_version_key" ON "BeamInputType"("slug", "version");

-- CreateIndex
CREATE INDEX "BeamInput_createdAt_id_idx" ON "BeamInput"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "BeamInput_organizationId_idx" ON "BeamInput"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "BeamRun_credentialId_key" ON "BeamRun"("credentialId");

-- CreateIndex
CREATE INDEX "BeamRun_createdAt_id_idx" ON "BeamRun"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "CredentialType_createdAt_id_idx" ON "CredentialType"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "CredentialType_slug_version_idx" ON "CredentialType"("slug", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CredentialType_slug_version_key" ON "CredentialType"("slug", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Credential_inputId_key" ON "Credential"("inputId");

-- CreateIndex
CREATE INDEX "Credential_organizationId_idx" ON "Credential"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CredentialStatus_credentialId_key" ON "CredentialStatus"("credentialId");

-- CreateIndex
CREATE UNIQUE INDEX "_PostToTag_AB_unique" ON "_PostToTag"("A", "B");

-- CreateIndex
CREATE INDEX "_PostToTag_B_index" ON "_PostToTag"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_OrderToPackageSet_AB_unique" ON "_OrderToPackageSet"("A", "B");

-- CreateIndex
CREATE INDEX "_OrderToPackageSet_B_index" ON "_OrderToPackageSet"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_PackageSetToSearchType_AB_unique" ON "_PackageSetToSearchType"("A", "B");

-- CreateIndex
CREATE INDEX "_PackageSetToSearchType_B_index" ON "_PackageSetToSearchType"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_PackageSetTypeToSearchType_AB_unique" ON "_PackageSetTypeToSearchType"("A", "B");

-- CreateIndex
CREATE INDEX "_PackageSetTypeToSearchType_B_index" ON "_PackageSetTypeToSearchType"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ResultTypeToSearchType_AB_unique" ON "_ResultTypeToSearchType"("A", "B");

-- CreateIndex
CREATE INDEX "_ResultTypeToSearchType_B_index" ON "_ResultTypeToSearchType"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_DisclosureToPackageSet_AB_unique" ON "_DisclosureToPackageSet"("A", "B");

-- CreateIndex
CREATE INDEX "_DisclosureToPackageSet_B_index" ON "_DisclosureToPackageSet"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_DisclosureToDisclosureAcceptance_AB_unique" ON "_DisclosureToDisclosureAcceptance"("A", "B");

-- CreateIndex
CREATE INDEX "_DisclosureToDisclosureAcceptance_B_index" ON "_DisclosureToDisclosureAcceptance"("B");

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hat" ADD CONSTRAINT "Hat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceLetter" ADD CONSTRAINT "ComplianceLetter_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationRelation" ADD CONSTRAINT "OrganizationRelation_primaryOrgId_fkey" FOREIGN KEY ("primaryOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationRelation" ADD CONSTRAINT "OrganizationRelation_affiliateOrgId_fkey" FOREIGN KEY ("affiliateOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Name" ADD CONSTRAINT "Name_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Name" ADD CONSTRAINT "Name_applicantDataId_fkey" FOREIGN KEY ("applicantDataId") REFERENCES "ApplicantData"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Name" ADD CONSTRAINT "Name_stateIdentificationCardId_fkey" FOREIGN KEY ("stateIdentificationCardId") REFERENCES "StateIdentificationCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Name" ADD CONSTRAINT "Name_passportId_fkey" FOREIGN KEY ("passportId") REFERENCES "Passport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyCredential" ADD CONSTRAINT "LegacyCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_applicantDataId_fkey" FOREIGN KEY ("applicantDataId") REFERENCES "ApplicantData"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_stateIdentificationCardId_fkey" FOREIGN KEY ("stateIdentificationCardId") REFERENCES "StateIdentificationCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_passportId_fkey" FOREIGN KEY ("passportId") REFERENCES "Passport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicantData" ADD CONSTRAINT "ApplicantData_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicantData" ADD CONSTRAINT "ApplicantData_applicantIDCardId_fkey" FOREIGN KEY ("applicantIDCardId") REFERENCES "ApplicantIDCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StateIdentificationCard" ADD CONSTRAINT "StateIdentificationCard_applicantDataId_fkey" FOREIGN KEY ("applicantDataId") REFERENCES "ApplicantData"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StateIdentificationCard" ADD CONSTRAINT "StateIdentificationCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passport" ADD CONSTRAINT "Passport_applicantDataId_fkey" FOREIGN KEY ("applicantDataId") REFERENCES "ApplicantData"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passport" ADD CONSTRAINT "Passport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderNote" ADD CONSTRAINT "OrderNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE SET NULL;

-- AddForeignKey
ALTER TABLE "OrderNote" ADD CONSTRAINT "OrderNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareOrderRecord" ADD CONSTRAINT "ShareOrderRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareOrderRecord" ADD CONSTRAINT "ShareOrderRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageSet" ADD CONSTRAINT "PackageSet_packageSetTypeId_fkey" FOREIGN KEY ("packageSetTypeId") REFERENCES "PackageSetType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vIDVoucher" ADD CONSTRAINT "vIDVoucher_packageSetId_fkey" FOREIGN KEY ("packageSetId") REFERENCES "PackageSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vIDVoucher" ADD CONSTRAINT "vIDVoucher_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vIDVoucher" ADD CONSTRAINT "vIDVoucher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_selfieUserId_fkey" FOREIGN KEY ("selfieUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_frontIdUserId_fkey" FOREIGN KEY ("frontIdUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_backIdUserId_fkey" FOREIGN KEY ("backIdUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_stateIdentificationCardSelfieId_fkey" FOREIGN KEY ("stateIdentificationCardSelfieId") REFERENCES "StateIdentificationCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_stateIdentificationCardFrontId_fkey" FOREIGN KEY ("stateIdentificationCardFrontId") REFERENCES "StateIdentificationCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_stateIdentificationCardBackId_fkey" FOREIGN KEY ("stateIdentificationCardBackId") REFERENCES "StateIdentificationCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_stateIdentificationCardExtractId_fkey" FOREIGN KEY ("stateIdentificationCardExtractId") REFERENCES "StateIdentificationCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_passportCardSelfieId_fkey" FOREIGN KEY ("passportCardSelfieId") REFERENCES "Passport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_passportFrontId_fkey" FOREIGN KEY ("passportFrontId") REFERENCES "Passport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_passportExtractPhotoId_fkey" FOREIGN KEY ("passportExtractPhotoId") REFERENCES "Passport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_disclosureAcceptanceId_fkey" FOREIGN KEY ("disclosureAcceptanceId") REFERENCES "DisclosureAcceptance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_beamInputId_fkey" FOREIGN KEY ("beamInputId") REFERENCES "BeamInput"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestedSearch" ADD CONSTRAINT "RequestedSearch_searchTypeId_fkey" FOREIGN KEY ("searchTypeId") REFERENCES "SearchType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestedSearch" ADD CONSTRAINT "RequestedSearch_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchedSearch" ADD CONSTRAINT "DispatchedSearch_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchedSearch" ADD CONSTRAINT "DispatchedSearch_searchTypeId_fkey" FOREIGN KEY ("searchTypeId") REFERENCES "SearchType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchedSearch" ADD CONSTRAINT "DispatchedSearch_requestedSearchId_fkey" FOREIGN KEY ("requestedSearchId") REFERENCES "RequestedSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_requestedSearchId_fkey" FOREIGN KEY ("requestedSearchId") REFERENCES "RequestedSearch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultRevision" ADD CONSTRAINT "ResultRevision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultRevision" ADD CONSTRAINT "ResultRevision_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "Result"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disclosure" ADD CONSTRAINT "Disclosure_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disclosure" ADD CONSTRAINT "Disclosure_craId_fkey" FOREIGN KEY ("craId") REFERENCES "OrganizationRelation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisclosureAcceptance" ADD CONSTRAINT "DisclosureAcceptance_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisclosureAcceptance" ADD CONSTRAINT "DisclosureAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HighlySensitiveIdentifier" ADD CONSTRAINT "HighlySensitiveIdentifier_applicantDataId_fkey" FOREIGN KEY ("applicantDataId") REFERENCES "ApplicantData"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HighlySensitiveIdentifier" ADD CONSTRAINT "HighlySensitiveIdentifier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HighlySensitiveIdentifier" ADD CONSTRAINT "HighlySensitiveIdentifier_beamInputId_fkey" FOREIGN KEY ("beamInputId") REFERENCES "BeamInput"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportableIdVerificationResult" ADD CONSTRAINT "ReportableIdVerificationResult_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportableIdVerificationResult" ADD CONSTRAINT "ReportableIdVerificationResult_applicantAliasDataId_fkey" FOREIGN KEY ("applicantAliasDataId") REFERENCES "ApplicantData"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beam" ADD CONSTRAINT "Beam_triggeredByPackageSetId_fkey" FOREIGN KEY ("triggeredByPackageSetId") REFERENCES "PackageSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeamInputType" ADD CONSTRAINT "BeamInputType_beamId_fkey" FOREIGN KEY ("beamId") REFERENCES "Beam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeamInput" ADD CONSTRAINT "BeamInput_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "BeamInputType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeamInput" ADD CONSTRAINT "BeamInput_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeamRun" ADD CONSTRAINT "BeamRun_inputId_fkey" FOREIGN KEY ("inputId") REFERENCES "BeamInput"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeamRun" ADD CONSTRAINT "BeamRun_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialType" ADD CONSTRAINT "CredentialType_beamId_fkey" FOREIGN KEY ("beamId") REFERENCES "Beam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "CredentialType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_inputId_fkey" FOREIGN KEY ("inputId") REFERENCES "BeamInput"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialStatus" ADD CONSTRAINT "CredentialStatus_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PostToTag" ADD CONSTRAINT "_PostToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PostToTag" ADD CONSTRAINT "_PostToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OrderToPackageSet" ADD CONSTRAINT "_OrderToPackageSet_A_fkey" FOREIGN KEY ("A") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OrderToPackageSet" ADD CONSTRAINT "_OrderToPackageSet_B_fkey" FOREIGN KEY ("B") REFERENCES "PackageSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PackageSetToSearchType" ADD CONSTRAINT "_PackageSetToSearchType_A_fkey" FOREIGN KEY ("A") REFERENCES "PackageSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PackageSetToSearchType" ADD CONSTRAINT "_PackageSetToSearchType_B_fkey" FOREIGN KEY ("B") REFERENCES "SearchType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PackageSetTypeToSearchType" ADD CONSTRAINT "_PackageSetTypeToSearchType_A_fkey" FOREIGN KEY ("A") REFERENCES "PackageSetType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PackageSetTypeToSearchType" ADD CONSTRAINT "_PackageSetTypeToSearchType_B_fkey" FOREIGN KEY ("B") REFERENCES "SearchType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ResultTypeToSearchType" ADD CONSTRAINT "_ResultTypeToSearchType_A_fkey" FOREIGN KEY ("A") REFERENCES "ResultType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ResultTypeToSearchType" ADD CONSTRAINT "_ResultTypeToSearchType_B_fkey" FOREIGN KEY ("B") REFERENCES "SearchType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DisclosureToPackageSet" ADD CONSTRAINT "_DisclosureToPackageSet_A_fkey" FOREIGN KEY ("A") REFERENCES "Disclosure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DisclosureToPackageSet" ADD CONSTRAINT "_DisclosureToPackageSet_B_fkey" FOREIGN KEY ("B") REFERENCES "PackageSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DisclosureToDisclosureAcceptance" ADD CONSTRAINT "_DisclosureToDisclosureAcceptance_A_fkey" FOREIGN KEY ("A") REFERENCES "Disclosure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DisclosureToDisclosureAcceptance" ADD CONSTRAINT "_DisclosureToDisclosureAcceptance_B_fkey" FOREIGN KEY ("B") REFERENCES "DisclosureAcceptance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
