-- CreateTable
CREATE TABLE "OrgRole" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgRolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,

    CONSTRAINT "OrgRolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonOrgRole" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonOrgRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgRole_orgId_idx" ON "OrgRole"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgRole_orgId_key_key" ON "OrgRole"("orgId", "key");

-- CreateIndex
CREATE INDEX "OrgRolePermission_roleId_idx" ON "OrgRolePermission"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgRolePermission_roleId_permission_key" ON "OrgRolePermission"("roleId", "permission");

-- CreateIndex
CREATE INDEX "PersonOrgRole_personId_idx" ON "PersonOrgRole"("personId");

-- CreateIndex
CREATE INDEX "PersonOrgRole_roleId_idx" ON "PersonOrgRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonOrgRole_personId_roleId_key" ON "PersonOrgRole"("personId", "roleId");

-- AddForeignKey
ALTER TABLE "OrgRole" ADD CONSTRAINT "OrgRole_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgRolePermission" ADD CONSTRAINT "OrgRolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "OrgRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonOrgRole" ADD CONSTRAINT "PersonOrgRole_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonOrgRole" ADD CONSTRAINT "PersonOrgRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "OrgRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed system org roles for each Org.
WITH role_defs AS (
    SELECT *
    FROM (VALUES
        ('ORG_OWNER', 'Owner', true),
        ('ORG_ADMIN', 'Administrator', true),
        ('ORG_EDITOR', 'Editor', true),
        ('ORG_VIEWER', 'Viewer', true),
        ('ORG_MEMBER', 'Member', true)
    ) AS t(key, name, is_system)
)
INSERT INTO "OrgRole" ("id", "orgId", "key", "name", "isSystem", "createdAt", "updatedAt")
SELECT
    'orgrole_' || md5(o.id || ':' || rd.key),
    o.id,
    rd.key,
    rd.name,
    rd.is_system,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Org" o
CROSS JOIN role_defs rd
ON CONFLICT ("orgId", "key") DO NOTHING;

-- Seed permissions for system roles.
WITH permission_defs AS (
    SELECT *
    FROM (VALUES
        ('ORG_MEMBER', 'VIEW_SELF'),
        ('ORG_VIEWER', 'VIEW_SELF'),
        ('ORG_VIEWER', 'VIEW_ORG'),
        ('ORG_EDITOR', 'VIEW_SELF'),
        ('ORG_EDITOR', 'VIEW_ORG'),
        ('ORG_EDITOR', 'EDIT_SOLD_PRODUCTS'),
        ('ORG_ADMIN', 'VIEW_SELF'),
        ('ORG_ADMIN', 'VIEW_ORG'),
        ('ORG_ADMIN', 'EDIT_SOLD_PRODUCTS'),
        ('ORG_ADMIN', 'EDIT_PAYCHECKS'),
        ('ORG_ADMIN', 'MANAGE_AGENCIES'),
        ('ORG_ADMIN', 'ACCESS_ADMIN_TOOLS'),
        ('ORG_ADMIN', 'CAN_ISSUE_POLICIES'),
        ('ORG_OWNER', 'VIEW_SELF'),
        ('ORG_OWNER', 'VIEW_ORG'),
        ('ORG_OWNER', 'EDIT_SOLD_PRODUCTS'),
        ('ORG_OWNER', 'EDIT_PAYCHECKS'),
        ('ORG_OWNER', 'MANAGE_AGENCIES'),
        ('ORG_OWNER', 'ACCESS_ADMIN_TOOLS'),
        ('ORG_OWNER', 'DELETE_AGENCIES'),
        ('ORG_OWNER', 'CAN_ISSUE_POLICIES')
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

-- Assign ORG_OWNER to admins or earliest person per org.
WITH owner_roles AS (
    SELECT o.id AS org_id, r.id AS role_id
    FROM "Org" o
    JOIN "OrgRole" r ON r."orgId" = o.id AND r."key" = 'ORG_OWNER'
),
admin_people AS (
    SELECT p.id AS person_id, p."orgId" AS org_id
    FROM "Person" p
    WHERE p."isAdmin" = true
),
admin_assignments AS (
    SELECT ap.person_id, orl.role_id
    FROM admin_people ap
    JOIN owner_roles orl ON orl.org_id = ap.org_id
),
fallback_people AS (
    SELECT DISTINCT ON (p."orgId") p.id AS person_id, p."orgId" AS org_id
    FROM "Person" p
    WHERE NOT EXISTS (
        SELECT 1
        FROM "Person" p2
        WHERE p2."orgId" = p."orgId" AND p2."isAdmin" = true
    )
    ORDER BY p."orgId", p."createdAt" ASC
),
fallback_assignments AS (
    SELECT fp.person_id, orl.role_id
    FROM fallback_people fp
    JOIN owner_roles orl ON orl.org_id = fp.org_id
)
INSERT INTO "PersonOrgRole" ("id", "personId", "roleId", "createdAt", "updatedAt")
SELECT
    'personorgrole_' || md5(assignments.person_id || ':' || assignments.role_id),
    assignments.person_id,
    assignments.role_id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT * FROM admin_assignments
    UNION
    SELECT * FROM fallback_assignments
) AS assignments
ON CONFLICT ("personId", "roleId") DO NOTHING;
