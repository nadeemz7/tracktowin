-- DropForeignKey
ALTER TABLE "ActivityDailyExpectation" DROP CONSTRAINT "ActivityDailyExpectation_activityTypeId_fkey";

-- DropForeignKey
ALTER TABLE "ActivityDailyExpectation" DROP CONSTRAINT "ActivityDailyExpectation_teamId_fkey";

-- DropForeignKey
ALTER TABLE "ActivityEvent" DROP CONSTRAINT "ActivityEvent_activityTypeId_fkey";

-- DropForeignKey
ALTER TABLE "ActivityEvent" DROP CONSTRAINT "ActivityEvent_personId_fkey";

-- DropForeignKey
ALTER TABLE "ActivityPayoutTier" DROP CONSTRAINT "ActivityPayoutTier_activityTypeId_fkey";

-- DropForeignKey
ALTER TABLE "ActivityRecord" DROP CONSTRAINT "ActivityRecord_personId_fkey";

-- DropForeignKey
ALTER TABLE "ActivityTarget" DROP CONSTRAINT "ActivityTarget_activityTypeId_fkey";

-- DropForeignKey
ALTER TABLE "ActivityTarget" DROP CONSTRAINT "ActivityTarget_personId_fkey";

-- DropForeignKey
ALTER TABLE "ActivityTeamVisibility" DROP CONSTRAINT "ActivityTeamVisibility_activityTypeId_fkey";

-- DropForeignKey
ALTER TABLE "ActivityTeamVisibility" DROP CONSTRAINT "ActivityTeamVisibility_teamId_fkey";

-- DropForeignKey
ALTER TABLE "ActivityType" DROP CONSTRAINT "ActivityType_agencyId_fkey";

-- DropForeignKey
ALTER TABLE "BenchOfficePlan" DROP CONSTRAINT "BenchOfficePlan_agencyId_fkey";

-- DropForeignKey
ALTER TABLE "BenchPersonOverride" DROP CONSTRAINT "BenchPersonOverride_personId_fkey";

-- DropForeignKey
ALTER TABLE "BenchRoleExpectation" DROP CONSTRAINT "BenchRoleExpectation_roleId_fkey";

-- DropForeignKey
ALTER TABLE "CommissionComponent" DROP CONSTRAINT "CommissionComponent_planId_fkey";

-- DropForeignKey
ALTER TABLE "CommissionPlan" DROP CONSTRAINT "CommissionPlan_agencyId_fkey";

-- DropForeignKey
ALTER TABLE "CommissionPlanAssignment" DROP CONSTRAINT "CommissionPlanAssignment_personId_fkey";

-- DropForeignKey
ALTER TABLE "CommissionPlanAssignment" DROP CONSTRAINT "CommissionPlanAssignment_planId_fkey";

-- DropForeignKey
ALTER TABLE "CompPlan" DROP CONSTRAINT "CompPlan_agencyId_fkey";

-- DropForeignKey
ALTER TABLE "CompPlanAssignment" DROP CONSTRAINT "CompPlanAssignment_planId_fkey";

-- DropForeignKey
ALTER TABLE "CompPlanBonusModule" DROP CONSTRAINT "CompPlanBonusModule_planVersionId_fkey";

-- DropForeignKey
ALTER TABLE "CompPlanGate" DROP CONSTRAINT "CompPlanGate_planVersionId_fkey";

-- DropForeignKey
ALTER TABLE "CompPlanRuleBlock" DROP CONSTRAINT "CompPlanRuleBlock_planVersionId_fkey";

-- DropForeignKey
ALTER TABLE "CompPlanScorecardCondition" DROP CONSTRAINT "CompPlanScorecardCondition_groupId_fkey";

-- DropForeignKey
ALTER TABLE "CompPlanScorecardCondition" DROP CONSTRAINT "CompPlanScorecardCondition_tierId_fkey";

-- DropForeignKey
ALTER TABLE "CompPlanScorecardConditionGroup" DROP CONSTRAINT "CompPlanScorecardConditionGroup_tierId_fkey";

-- DropForeignKey
ALTER TABLE "CompPlanScorecardReward" DROP CONSTRAINT "CompPlanScorecardReward_tierId_fkey";

-- DropForeignKey
ALTER TABLE "CompPlanScorecardTier" DROP CONSTRAINT "CompPlanScorecardTier_bonusModuleId_fkey";

-- DropForeignKey
ALTER TABLE "CompPlanTierRow" DROP CONSTRAINT "CompPlanTierRow_ruleBlockId_fkey";

-- DropForeignKey
ALTER TABLE "CompPlanVersion" DROP CONSTRAINT "CompPlanVersion_planId_fkey";

-- DropForeignKey
ALTER TABLE "Household" DROP CONSTRAINT "Household_agencyId_fkey";

-- DropForeignKey
ALTER TABLE "HouseholdFieldDefinition" DROP CONSTRAINT "HouseholdFieldDefinition_agencyId_fkey";

-- DropForeignKey
ALTER TABLE "HouseholdFieldValue" DROP CONSTRAINT "HouseholdFieldValue_fieldDefinitionId_fkey";

-- DropForeignKey
ALTER TABLE "HouseholdFieldValue" DROP CONSTRAINT "HouseholdFieldValue_householdId_fkey";

-- DropForeignKey
ALTER TABLE "LineOfBusiness" DROP CONSTRAINT "LineOfBusiness_agencyId_fkey";

-- DropForeignKey
ALTER TABLE "MarketingSourceOption" DROP CONSTRAINT "MarketingSourceOption_agencyId_fkey";

-- DropForeignKey
ALTER TABLE "Person" DROP CONSTRAINT "Person_primaryAgencyId_fkey";

-- DropForeignKey
ALTER TABLE "PremiumBucket" DROP CONSTRAINT "PremiumBucket_agencyId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_lineOfBusinessId_fkey";

-- DropForeignKey
ALTER TABLE "ProductionExpectation" DROP CONSTRAINT "ProductionExpectation_activityTypeId_fkey";

-- DropForeignKey
ALTER TABLE "ProductionExpectation" DROP CONSTRAINT "ProductionExpectation_agencyId_fkey";

-- DropForeignKey
ALTER TABLE "ProductionExpectation" DROP CONSTRAINT "ProductionExpectation_lineOfBusinessId_fkey";

-- DropForeignKey
ALTER TABLE "ProductionExpectation" DROP CONSTRAINT "ProductionExpectation_roleId_fkey";

-- DropForeignKey
ALTER TABLE "ReportPreset" DROP CONSTRAINT "ReportPreset_agencyId_fkey";

-- DropForeignKey
ALTER TABLE "RoiCompPlan" DROP CONSTRAINT "RoiCompPlan_personId_fkey";

-- DropForeignKey
ALTER TABLE "RoiMonthlyInputs" DROP CONSTRAINT "RoiMonthlyInputs_personId_fkey";

-- DropForeignKey
ALTER TABLE "Role" DROP CONSTRAINT "Role_teamId_fkey";

-- DropForeignKey
ALTER TABLE "SoldProduct" DROP CONSTRAINT "SoldProduct_agencyId_fkey";

-- DropForeignKey
ALTER TABLE "SoldProduct" DROP CONSTRAINT "SoldProduct_householdId_fkey";

-- DropForeignKey
ALTER TABLE "SoldProduct" DROP CONSTRAINT "SoldProduct_productId_fkey";

-- DropForeignKey
ALTER TABLE "Team" DROP CONSTRAINT "Team_agencyId_fkey";

-- DropForeignKey
ALTER TABLE "ValuePolicyDefault" DROP CONSTRAINT "ValuePolicyDefault_agencyId_fkey";

-- DropForeignKey
ALTER TABLE "WinTheDayPlan" DROP CONSTRAINT "WinTheDayPlan_agencyId_fkey";

-- DropForeignKey
ALTER TABLE "WinTheDayPlanPersonAssignment" DROP CONSTRAINT "WinTheDayPlanPersonAssignment_personId_fkey";

-- DropForeignKey
ALTER TABLE "WinTheDayPlanPersonAssignment" DROP CONSTRAINT "WinTheDayPlanPersonAssignment_planId_fkey";

-- DropForeignKey
ALTER TABLE "WinTheDayPlanTeamAssignment" DROP CONSTRAINT "WinTheDayPlanTeamAssignment_planId_fkey";

-- DropForeignKey
ALTER TABLE "WinTheDayPlanTeamAssignment" DROP CONSTRAINT "WinTheDayPlanTeamAssignment_teamId_fkey";

-- DropForeignKey
ALTER TABLE "WinTheDayRule" DROP CONSTRAINT "WinTheDayRule_planId_fkey";

-- AddForeignKey
ALTER TABLE "LineOfBusiness" ADD CONSTRAINT "LineOfBusiness_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_lineOfBusinessId_fkey" FOREIGN KEY ("lineOfBusinessId") REFERENCES "LineOfBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Household" ADD CONSTRAINT "Household_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldProduct" ADD CONSTRAINT "SoldProduct_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldProduct" ADD CONSTRAINT "SoldProduct_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldProduct" ADD CONSTRAINT "SoldProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityRecord" ADD CONSTRAINT "ActivityRecord_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTarget" ADD CONSTRAINT "ActivityTarget_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTarget" ADD CONSTRAINT "ActivityTarget_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_primaryAgencyId_fkey" FOREIGN KEY ("primaryAgencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSourceOption" ADD CONSTRAINT "MarketingSourceOption_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdFieldDefinition" ADD CONSTRAINT "HouseholdFieldDefinition_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdFieldValue" ADD CONSTRAINT "HouseholdFieldValue_fieldDefinitionId_fkey" FOREIGN KEY ("fieldDefinitionId") REFERENCES "HouseholdFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdFieldValue" ADD CONSTRAINT "HouseholdFieldValue_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremiumBucket" ADD CONSTRAINT "PremiumBucket_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuePolicyDefault" ADD CONSTRAINT "ValuePolicyDefault_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPlan" ADD CONSTRAINT "CommissionPlan_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionComponent" ADD CONSTRAINT "CommissionComponent_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CommissionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPlanAssignment" ADD CONSTRAINT "CommissionPlanAssignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPlanAssignment" ADD CONSTRAINT "CommissionPlanAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CommissionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityType" ADD CONSTRAINT "ActivityType_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTeamVisibility" ADD CONSTRAINT "ActivityTeamVisibility_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTeamVisibility" ADD CONSTRAINT "ActivityTeamVisibility_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityDailyExpectation" ADD CONSTRAINT "ActivityDailyExpectation_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityDailyExpectation" ADD CONSTRAINT "ActivityDailyExpectation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityPayoutTier" ADD CONSTRAINT "ActivityPayoutTier_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinTheDayPlan" ADD CONSTRAINT "WinTheDayPlan_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinTheDayRule" ADD CONSTRAINT "WinTheDayRule_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WinTheDayPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinTheDayPlanTeamAssignment" ADD CONSTRAINT "WinTheDayPlanTeamAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WinTheDayPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinTheDayPlanTeamAssignment" ADD CONSTRAINT "WinTheDayPlanTeamAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinTheDayPlanPersonAssignment" ADD CONSTRAINT "WinTheDayPlanPersonAssignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinTheDayPlanPersonAssignment" ADD CONSTRAINT "WinTheDayPlanPersonAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WinTheDayPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlan" ADD CONSTRAINT "CompPlan_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlanVersion" ADD CONSTRAINT "CompPlanVersion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CompPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlanRuleBlock" ADD CONSTRAINT "CompPlanRuleBlock_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "CompPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlanTierRow" ADD CONSTRAINT "CompPlanTierRow_ruleBlockId_fkey" FOREIGN KEY ("ruleBlockId") REFERENCES "CompPlanRuleBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlanGate" ADD CONSTRAINT "CompPlanGate_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "CompPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlanBonusModule" ADD CONSTRAINT "CompPlanBonusModule_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "CompPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlanScorecardTier" ADD CONSTRAINT "CompPlanScorecardTier_bonusModuleId_fkey" FOREIGN KEY ("bonusModuleId") REFERENCES "CompPlanBonusModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlanScorecardConditionGroup" ADD CONSTRAINT "CompPlanScorecardConditionGroup_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "CompPlanScorecardTier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlanScorecardCondition" ADD CONSTRAINT "CompPlanScorecardCondition_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "CompPlanScorecardTier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlanScorecardCondition" ADD CONSTRAINT "CompPlanScorecardCondition_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CompPlanScorecardConditionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlanScorecardReward" ADD CONSTRAINT "CompPlanScorecardReward_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "CompPlanScorecardTier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlanAssignment" ADD CONSTRAINT "CompPlanAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CompPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionExpectation" ADD CONSTRAINT "ProductionExpectation_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionExpectation" ADD CONSTRAINT "ProductionExpectation_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionExpectation" ADD CONSTRAINT "ProductionExpectation_lineOfBusinessId_fkey" FOREIGN KEY ("lineOfBusinessId") REFERENCES "LineOfBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionExpectation" ADD CONSTRAINT "ProductionExpectation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPreset" ADD CONSTRAINT "ReportPreset_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoiCompPlan" ADD CONSTRAINT "RoiCompPlan_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoiMonthlyInputs" ADD CONSTRAINT "RoiMonthlyInputs_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchOfficePlan" ADD CONSTRAINT "BenchOfficePlan_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchRoleExpectation" ADD CONSTRAINT "BenchRoleExpectation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchPersonOverride" ADD CONSTRAINT "BenchPersonOverride_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
