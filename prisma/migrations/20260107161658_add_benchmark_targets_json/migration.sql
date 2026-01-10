-- AlterTable
ALTER TABLE "BenchPersonOverride" ADD COLUMN     "activityTargetsByTypeOverrideJson" JSONB,
ADD COLUMN     "appGoalsByLobOverrideJson" JSONB;

-- AlterTable
ALTER TABLE "BenchRoleExpectation" ADD COLUMN     "activityTargetsByTypeJson" JSONB,
ADD COLUMN     "appGoalsByLobJson" JSONB;
