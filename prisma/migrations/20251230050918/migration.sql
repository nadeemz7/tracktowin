-- CreateEnum
CREATE TYPE "PremiumCategory" AS ENUM ('PC', 'FS', 'IPS');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('PERSONAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('WRITTEN', 'ISSUED', 'PAID', 'CANCELLED', 'STATUS_CHECK');

-- CreateEnum
CREATE TYPE "TeamType" AS ENUM ('SALES', 'CS');

-- CreateEnum
CREATE TYPE "CompRuleType" AS ENUM ('BASE', 'OVERRIDE', 'KICKER');

-- CreateEnum
CREATE TYPE "CompApplyScope" AS ENUM ('PRODUCT', 'LOB', 'PRODUCT_TYPE', 'PREMIUM_CATEGORY', 'BUCKET');

-- CreateEnum
CREATE TYPE "CompPayoutType" AS ENUM ('FLAT_PER_APP', 'PERCENT_OF_PREMIUM', 'FLAT_LUMP_SUM');

-- CreateEnum
CREATE TYPE "CompTierMode" AS ENUM ('NONE', 'TIERS');

-- CreateEnum
CREATE TYPE "CompTierBasis" AS ENUM ('APP_COUNT', 'PREMIUM_SUM', 'BUCKET_VALUE');

-- CreateEnum
CREATE TYPE "CompGateType" AS ENUM ('MIN_APPS', 'MIN_PREMIUM', 'MIN_BUCKET');

-- CreateEnum
CREATE TYPE "CompGateBehavior" AS ENUM ('HARD_GATE', 'RETROACTIVE', 'NON_RETROACTIVE');

-- CreateEnum
CREATE TYPE "CompGateScope" AS ENUM ('PLAN', 'RULE_BLOCKS', 'PRODUCTS');

-- CreateEnum
CREATE TYPE "CompBonusType" AS ENUM ('SCORECARD_TIER', 'GOAL_BONUS', 'ACTIVITY_BONUS', 'WTD_BONUS', 'PRODUCT_BONUS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CompMetricSource" AS ENUM ('BUCKET', 'ACTIVITY', 'WTD', 'APPS_COUNT', 'PREMIUM_CATEGORY');

-- CreateEnum
CREATE TYPE "CompRewardType" AS ENUM ('ADD_PERCENT_OF_BUCKET', 'ADD_FLAT_DOLLARS', 'MULTIPLIER');

-- CreateEnum
CREATE TYPE "ConditionOperator" AS ENUM ('GTE', 'GT', 'LTE', 'LT', 'EQ');

-- CreateEnum
CREATE TYPE "CompAssignmentScope" AS ENUM ('PERSON', 'ROLE', 'TEAM', 'TEAM_TYPE', 'AGENCY');

-- CreateEnum
CREATE TYPE "CompPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ActivityInputMode" AS ENUM ('COUNT', 'BOOLEAN', 'TEXT');

-- CreateEnum
CREATE TYPE "ActivityGroupingHint" AS ENUM ('BULK', 'PER_ENTRY');

-- CreateEnum
CREATE TYPE "WinSourceType" AS ENUM ('ACTIVITY', 'WRITTEN_APPS');

-- CreateEnum
CREATE TYPE "CommissionScope" AS ENUM ('AGENCY', 'TEAM', 'ROLE', 'PERSON', 'TEAM_TYPE');

-- CreateTable
CREATE TABLE "Agency" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profileName" TEXT,
    "ownerName" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineOfBusiness" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "premiumCategory" "PremiumCategory" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineOfBusiness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "lineOfBusinessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productType" "ProductType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "ecrmLink" TEXT,
    "marketingSource" TEXT,
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoldProduct" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "soldByName" TEXT,
    "soldByPersonId" TEXT,
    "dateSold" TIMESTAMP(3) NOT NULL,
    "premium" DOUBLE PRECISION NOT NULL,
    "status" "PolicyStatus" NOT NULL DEFAULT 'WRITTEN',
    "isValueHealth" BOOLEAN NOT NULL DEFAULT false,
    "isValueLife" BOOLEAN NOT NULL DEFAULT false,
    "policyFirstName" TEXT,
    "policyLastName" TEXT,
    "policyId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SoldProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityRecord" (
    "id" TEXT NOT NULL,
    "personName" TEXT,
    "personId" TEXT,
    "activityDate" TIMESTAMP(3) NOT NULL,
    "activityName" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "teamType" "TeamType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "teamId" TEXT,
    "roleId" TEXT,
    "primaryAgencyId" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isManager" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingSourceOption" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingSourceOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdFieldDefinition" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdFieldValue" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "fieldDefinitionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PremiumBucket" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "includesLobs" TEXT[],
    "includesProducts" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PremiumBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValuePolicyDefault" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "lineOfBusiness" TEXT NOT NULL,
    "flagField" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ValuePolicyDefault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPlan" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT,
    "name" TEXT NOT NULL,
    "scope" "CommissionScope" NOT NULL,
    "teamId" TEXT,
    "roleId" TEXT,
    "personId" TEXT,
    "teamType" "TeamType",
    "isDefaultForTeamType" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionComponent" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "componentType" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPlanAssignment" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionPlanAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityType" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "inputMode" "ActivityInputMode" NOT NULL DEFAULT 'COUNT',
    "unitLabel" TEXT,
    "requiresFullName" BOOLEAN NOT NULL DEFAULT false,
    "payable" BOOLEAN NOT NULL DEFAULT false,
    "payoutMode" TEXT,
    "flatPayoutValue" DOUBLE PRECISION,
    "trackOnly" BOOLEAN NOT NULL DEFAULT true,
    "defaultQuotaPerDay" INTEGER,
    "groupingHint" "ActivityGroupingHint",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityTeamVisibility" (
    "id" TEXT NOT NULL,
    "activityTypeId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "canUse" BOOLEAN NOT NULL DEFAULT true,
    "isDefaultForTeam" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityTeamVisibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityDailyExpectation" (
    "id" TEXT NOT NULL,
    "activityTypeId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "expectedPerDay" INTEGER,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityDailyExpectation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityPayoutTier" (
    "id" TEXT NOT NULL,
    "activityTypeId" TEXT NOT NULL,
    "minValue" DOUBLE PRECISION NOT NULL,
    "maxValue" DOUBLE PRECISION,
    "payoutValue" DOUBLE PRECISION NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityPayoutTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WinTheDayPlan" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT,
    "name" TEXT NOT NULL,
    "pointsToWin" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WinTheDayPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WinTheDayRule" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "sourceType" "WinSourceType" NOT NULL,
    "activityTypeId" TEXT,
    "unitsPerPoint" DOUBLE PRECISION,
    "pointsAwarded" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WinTheDayRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WinTheDayPlanTeamAssignment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WinTheDayPlanTeamAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WinTheDayPlanPersonAssignment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "personId" TEXT,
    "personName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WinTheDayPlanPersonAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompPlan" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CompPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "defaultStatusEligibility" "PolicyStatus"[],
    "effectiveStartMonth" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompPlanVersion" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "effectiveStartMonth" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CompPlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompPlanRuleBlock" (
    "id" TEXT NOT NULL,
    "planVersionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "ruleType" "CompRuleType" NOT NULL,
    "statusEligibilityOverride" "PolicyStatus"[],
    "applyScope" "CompApplyScope" NOT NULL,
    "applyFilters" JSONB,
    "payoutType" "CompPayoutType" NOT NULL,
    "basePayoutValue" DOUBLE PRECISION,
    "tierMode" "CompTierMode" NOT NULL,
    "tierBasis" "CompTierBasis",
    "bucketId" TEXT,
    "minThreshold" DOUBLE PRECISION,
    "gateBehavior" "CompGateBehavior",
    "notes" TEXT,
    "maxPayout" DOUBLE PRECISION,

    CONSTRAINT "CompPlanRuleBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompPlanTierRow" (
    "id" TEXT NOT NULL,
    "ruleBlockId" TEXT NOT NULL,
    "minValue" DOUBLE PRECISION NOT NULL,
    "maxValue" DOUBLE PRECISION,
    "payoutValue" DOUBLE PRECISION NOT NULL,
    "payoutUnit" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CompPlanTierRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompPlanGate" (
    "id" TEXT NOT NULL,
    "planVersionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,
    "gateType" "CompGateType" NOT NULL,
    "bucketId" TEXT,
    "thresholdValue" DOUBLE PRECISION NOT NULL,
    "behavior" "CompGateBehavior" NOT NULL,
    "scope" "CompGateScope" NOT NULL,
    "ruleBlockIds" TEXT[],

    CONSTRAINT "CompPlanGate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompPlanBonusModule" (
    "id" TEXT NOT NULL,
    "planVersionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,
    "bonusType" "CompBonusType" NOT NULL,
    "config" JSONB,
    "highestTierWins" BOOLEAN NOT NULL DEFAULT true,
    "stackTiers" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CompPlanBonusModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompPlanScorecardTier" (
    "id" TEXT NOT NULL,
    "bonusModuleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "requiresAllConditions" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CompPlanScorecardTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompPlanScorecardCondition" (
    "id" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "metricSource" "CompMetricSource" NOT NULL,
    "bucketId" TEXT,
    "activityTypeId" TEXT,
    "operator" "ConditionOperator" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "statusFilter" "PolicyStatus",
    "timeframe" TEXT,

    CONSTRAINT "CompPlanScorecardCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompPlanScorecardReward" (
    "id" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "rewardType" "CompRewardType" NOT NULL,
    "bucketId" TEXT,
    "premiumCategory" "PremiumCategory",
    "percentValue" DOUBLE PRECISION,
    "dollarValue" DOUBLE PRECISION,

    CONSTRAINT "CompPlanScorecardReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompPlanAssignment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "scopeType" "CompAssignmentScope" NOT NULL,
    "scopeId" TEXT,
    "effectiveStartMonth" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompPlanAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompMonthlyResult" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT,
    "personId" TEXT,
    "personName" TEXT,
    "month" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planVersionId" TEXT NOT NULL,
    "baseEarnings" DOUBLE PRECISION NOT NULL,
    "bonusEarnings" DOUBLE PRECISION NOT NULL,
    "totalEarnings" DOUBLE PRECISION NOT NULL,
    "bucketValues" JSONB NOT NULL,
    "breakdown" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompMonthlyResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionExpectation" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT,
    "roleId" TEXT NOT NULL,
    "lineOfBusinessId" TEXT,
    "activityTypeId" TEXT,
    "monthKey" TEXT,
    "targetApps" DOUBLE PRECISION,
    "targetPremium" DOUBLE PRECISION,
    "targetActivityCount" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionExpectation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportPreset" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "configJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LineOfBusiness_agencyId_name_key" ON "LineOfBusiness"("agencyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_lineOfBusinessId_name_key" ON "Product"("lineOfBusinessId", "name");

-- CreateIndex
CREATE INDEX "Household_agencyId_lastName_firstName_idx" ON "Household"("agencyId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "SoldProduct_agencyId_dateSold_idx" ON "SoldProduct"("agencyId", "dateSold");

-- CreateIndex
CREATE INDEX "SoldProduct_productId_dateSold_idx" ON "SoldProduct"("productId", "dateSold");

-- CreateIndex
CREATE INDEX "SoldProduct_householdId_dateSold_idx" ON "SoldProduct"("householdId", "dateSold");

-- CreateIndex
CREATE INDEX "SoldProduct_soldByName_dateSold_idx" ON "SoldProduct"("soldByName", "dateSold");

-- CreateIndex
CREATE INDEX "SoldProduct_soldByPersonId_dateSold_idx" ON "SoldProduct"("soldByPersonId", "dateSold");

-- CreateIndex
CREATE INDEX "ActivityRecord_personName_activityDate_idx" ON "ActivityRecord"("personName", "activityDate");

-- CreateIndex
CREATE INDEX "ActivityRecord_personId_activityDate_idx" ON "ActivityRecord"("personId", "activityDate");

-- CreateIndex
CREATE INDEX "MarketingSourceOption_agencyId_active_idx" ON "MarketingSourceOption"("agencyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingSourceOption_name_key" ON "MarketingSourceOption"("name");

-- CreateIndex
CREATE INDEX "HouseholdFieldDefinition_agencyId_active_idx" ON "HouseholdFieldDefinition"("agencyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdFieldDefinition_agencyId_fieldName_key" ON "HouseholdFieldDefinition"("agencyId", "fieldName");

-- CreateIndex
CREATE INDEX "HouseholdFieldValue_householdId_idx" ON "HouseholdFieldValue"("householdId");

-- CreateIndex
CREATE INDEX "HouseholdFieldValue_fieldDefinitionId_idx" ON "HouseholdFieldValue"("fieldDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_agencyId_name_key" ON "Team"("agencyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Role_teamId_name_key" ON "Role"("teamId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PremiumBucket_agencyId_name_key" ON "PremiumBucket"("agencyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ValuePolicyDefault_agencyId_flagField_lineOfBusiness_key" ON "ValuePolicyDefault"("agencyId", "flagField", "lineOfBusiness");

-- CreateIndex
CREATE INDEX "CommissionPlan_agencyId_idx" ON "CommissionPlan"("agencyId");

-- CreateIndex
CREATE INDEX "CommissionPlan_teamId_idx" ON "CommissionPlan"("teamId");

-- CreateIndex
CREATE INDEX "CommissionPlan_roleId_idx" ON "CommissionPlan"("roleId");

-- CreateIndex
CREATE INDEX "CommissionPlan_personId_idx" ON "CommissionPlan"("personId");

-- CreateIndex
CREATE INDEX "CommissionPlan_teamType_idx" ON "CommissionPlan"("teamType");

-- CreateIndex
CREATE INDEX "CommissionComponent_planId_idx" ON "CommissionComponent"("planId");

-- CreateIndex
CREATE INDEX "CommissionPlanAssignment_personId_idx" ON "CommissionPlanAssignment"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPlanAssignment_personId_planId_effectiveFrom_key" ON "CommissionPlanAssignment"("personId", "planId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ActivityType_agencyId_active_idx" ON "ActivityType"("agencyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityType_agencyId_name_key" ON "ActivityType"("agencyId", "name");

-- CreateIndex
CREATE INDEX "ActivityTeamVisibility_teamId_idx" ON "ActivityTeamVisibility"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityTeamVisibility_activityTypeId_teamId_key" ON "ActivityTeamVisibility"("activityTypeId", "teamId");

-- CreateIndex
CREATE INDEX "ActivityDailyExpectation_teamId_idx" ON "ActivityDailyExpectation"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityDailyExpectation_activityTypeId_teamId_key" ON "ActivityDailyExpectation"("activityTypeId", "teamId");

-- CreateIndex
CREATE INDEX "ActivityPayoutTier_activityTypeId_idx" ON "ActivityPayoutTier"("activityTypeId");

-- CreateIndex
CREATE INDEX "WinTheDayPlan_agencyId_idx" ON "WinTheDayPlan"("agencyId");

-- CreateIndex
CREATE INDEX "WinTheDayRule_planId_idx" ON "WinTheDayRule"("planId");

-- CreateIndex
CREATE INDEX "WinTheDayRule_activityTypeId_idx" ON "WinTheDayRule"("activityTypeId");

-- CreateIndex
CREATE INDEX "WinTheDayPlanTeamAssignment_planId_idx" ON "WinTheDayPlanTeamAssignment"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "WinTheDayPlanTeamAssignment_teamId_key" ON "WinTheDayPlanTeamAssignment"("teamId");

-- CreateIndex
CREATE INDEX "WinTheDayPlanPersonAssignment_planId_idx" ON "WinTheDayPlanPersonAssignment"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "WinTheDayPlanPersonAssignment_personId_key" ON "WinTheDayPlanPersonAssignment"("personId");

-- CreateIndex
CREATE INDEX "CompPlanVersion_planId_idx" ON "CompPlanVersion"("planId");

-- CreateIndex
CREATE INDEX "CompPlanRuleBlock_planVersionId_idx" ON "CompPlanRuleBlock"("planVersionId");

-- CreateIndex
CREATE INDEX "CompPlanTierRow_ruleBlockId_idx" ON "CompPlanTierRow"("ruleBlockId");

-- CreateIndex
CREATE INDEX "CompPlanGate_planVersionId_idx" ON "CompPlanGate"("planVersionId");

-- CreateIndex
CREATE INDEX "CompPlanBonusModule_planVersionId_idx" ON "CompPlanBonusModule"("planVersionId");

-- CreateIndex
CREATE INDEX "CompPlanScorecardTier_bonusModuleId_idx" ON "CompPlanScorecardTier"("bonusModuleId");

-- CreateIndex
CREATE INDEX "CompPlanScorecardCondition_tierId_idx" ON "CompPlanScorecardCondition"("tierId");

-- CreateIndex
CREATE INDEX "CompPlanScorecardReward_tierId_idx" ON "CompPlanScorecardReward"("tierId");

-- CreateIndex
CREATE INDEX "CompPlanAssignment_planId_idx" ON "CompPlanAssignment"("planId");

-- CreateIndex
CREATE INDEX "CompPlanAssignment_scopeType_scopeId_idx" ON "CompPlanAssignment"("scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "CompMonthlyResult_personId_month_idx" ON "CompMonthlyResult"("personId", "month");

-- CreateIndex
CREATE INDEX "CompMonthlyResult_planId_month_idx" ON "CompMonthlyResult"("planId", "month");

-- CreateIndex
CREATE INDEX "ProductionExpectation_agencyId_idx" ON "ProductionExpectation"("agencyId");

-- CreateIndex
CREATE INDEX "ProductionExpectation_roleId_idx" ON "ProductionExpectation"("roleId");

-- CreateIndex
CREATE INDEX "ProductionExpectation_lineOfBusinessId_idx" ON "ProductionExpectation"("lineOfBusinessId");

-- CreateIndex
CREATE INDEX "ProductionExpectation_activityTypeId_idx" ON "ProductionExpectation"("activityTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionExpectation_roleId_lineOfBusinessId_activityTypeI_key" ON "ProductionExpectation"("roleId", "lineOfBusinessId", "activityTypeId", "monthKey");

-- CreateIndex
CREATE INDEX "ReportPreset_agencyId_idx" ON "ReportPreset"("agencyId");

-- AddForeignKey
ALTER TABLE "LineOfBusiness" ADD CONSTRAINT "LineOfBusiness_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_lineOfBusinessId_fkey" FOREIGN KEY ("lineOfBusinessId") REFERENCES "LineOfBusiness"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Household" ADD CONSTRAINT "Household_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldProduct" ADD CONSTRAINT "SoldProduct_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldProduct" ADD CONSTRAINT "SoldProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldProduct" ADD CONSTRAINT "SoldProduct_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldProduct" ADD CONSTRAINT "SoldProduct_soldByPersonId_fkey" FOREIGN KEY ("soldByPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityRecord" ADD CONSTRAINT "ActivityRecord_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_primaryAgencyId_fkey" FOREIGN KEY ("primaryAgencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSourceOption" ADD CONSTRAINT "MarketingSourceOption_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdFieldDefinition" ADD CONSTRAINT "HouseholdFieldDefinition_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdFieldValue" ADD CONSTRAINT "HouseholdFieldValue_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdFieldValue" ADD CONSTRAINT "HouseholdFieldValue_fieldDefinitionId_fkey" FOREIGN KEY ("fieldDefinitionId") REFERENCES "HouseholdFieldDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremiumBucket" ADD CONSTRAINT "PremiumBucket_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuePolicyDefault" ADD CONSTRAINT "ValuePolicyDefault_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPlan" ADD CONSTRAINT "CommissionPlan_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPlan" ADD CONSTRAINT "CommissionPlan_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPlan" ADD CONSTRAINT "CommissionPlan_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPlan" ADD CONSTRAINT "CommissionPlan_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionComponent" ADD CONSTRAINT "CommissionComponent_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CommissionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPlanAssignment" ADD CONSTRAINT "CommissionPlanAssignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPlanAssignment" ADD CONSTRAINT "CommissionPlanAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CommissionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityType" ADD CONSTRAINT "ActivityType_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTeamVisibility" ADD CONSTRAINT "ActivityTeamVisibility_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTeamVisibility" ADD CONSTRAINT "ActivityTeamVisibility_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityDailyExpectation" ADD CONSTRAINT "ActivityDailyExpectation_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityDailyExpectation" ADD CONSTRAINT "ActivityDailyExpectation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityPayoutTier" ADD CONSTRAINT "ActivityPayoutTier_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinTheDayPlan" ADD CONSTRAINT "WinTheDayPlan_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinTheDayRule" ADD CONSTRAINT "WinTheDayRule_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WinTheDayPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinTheDayRule" ADD CONSTRAINT "WinTheDayRule_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinTheDayPlanTeamAssignment" ADD CONSTRAINT "WinTheDayPlanTeamAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WinTheDayPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinTheDayPlanTeamAssignment" ADD CONSTRAINT "WinTheDayPlanTeamAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinTheDayPlanPersonAssignment" ADD CONSTRAINT "WinTheDayPlanPersonAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WinTheDayPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinTheDayPlanPersonAssignment" ADD CONSTRAINT "WinTheDayPlanPersonAssignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlan" ADD CONSTRAINT "CompPlan_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlanVersion" ADD CONSTRAINT "CompPlanVersion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CompPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlanRuleBlock" ADD CONSTRAINT "CompPlanRuleBlock_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "CompPlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlanTierRow" ADD CONSTRAINT "CompPlanTierRow_ruleBlockId_fkey" FOREIGN KEY ("ruleBlockId") REFERENCES "CompPlanRuleBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlanGate" ADD CONSTRAINT "CompPlanGate_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "CompPlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlanBonusModule" ADD CONSTRAINT "CompPlanBonusModule_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "CompPlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlanScorecardTier" ADD CONSTRAINT "CompPlanScorecardTier_bonusModuleId_fkey" FOREIGN KEY ("bonusModuleId") REFERENCES "CompPlanBonusModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlanScorecardCondition" ADD CONSTRAINT "CompPlanScorecardCondition_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "CompPlanScorecardTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlanScorecardReward" ADD CONSTRAINT "CompPlanScorecardReward_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "CompPlanScorecardTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlanAssignment" ADD CONSTRAINT "CompPlanAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CompPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionExpectation" ADD CONSTRAINT "ProductionExpectation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionExpectation" ADD CONSTRAINT "ProductionExpectation_lineOfBusinessId_fkey" FOREIGN KEY ("lineOfBusinessId") REFERENCES "LineOfBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionExpectation" ADD CONSTRAINT "ProductionExpectation_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionExpectation" ADD CONSTRAINT "ProductionExpectation_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPreset" ADD CONSTRAINT "ReportPreset_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
