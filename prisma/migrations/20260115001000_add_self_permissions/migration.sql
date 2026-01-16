-- Seed self permissions for system roles.
WITH permission_defs AS (
    SELECT *
    FROM (VALUES
        ('ORG_MEMBER', 'EDIT_SELF_SOLD_PRODUCTS'),
        ('ORG_MEMBER', 'CAN_ISSUE_POLICIES_SELF'),
        ('ORG_VIEWER', 'EDIT_SELF_SOLD_PRODUCTS'),
        ('ORG_VIEWER', 'CAN_ISSUE_POLICIES_SELF')
    ) AS t(role_key, permission)
)
INSERT INTO "OrgRolePermission" ("id", "roleId", "permission")
SELECT
    'orgroleperm_' || md5(r.id || ':' || pd.permission),
    r.id,
    pd.permission
FROM "OrgRole" r
JOIN permission_defs pd ON pd.role_key = r."key"
ON CONFLICT ("roleId", "permission") DO NOTHING;
