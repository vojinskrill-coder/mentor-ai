-- CreateTable: tenant_vaults
CREATE TABLE "tenant_vaults" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source_vault_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'creating',
    "concept_count" INTEGER NOT NULL DEFAULT 0,
    "category_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_vaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable: vault_operation_logs
CREATE TABLE "vault_operation_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "operation_type" TEXT NOT NULL,
    "concepts_affected" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'running',
    "details" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_operation_logs_pkey" PRIMARY KEY ("id")
);

-- AddColumns to concepts
ALTER TABLE "concepts" ADD COLUMN IF NOT EXISTS "vault_id" TEXT;
ALTER TABLE "concepts" ADD COLUMN IF NOT EXISTS "tier" TEXT DEFAULT 'semantic';
ALTER TABLE "concepts" ADD COLUMN IF NOT EXISTS "last_reinforced" TIMESTAMP(3);
ALTER TABLE "concepts" ADD COLUMN IF NOT EXISTS "section_tags" JSONB;

-- Update confidence default for existing rows
ALTER TABLE "concepts" ALTER COLUMN "confidence" SET DEFAULT 0.7;

-- DropIndex: remove global unique constraints on name and slug
DROP INDEX IF EXISTS "concepts_name_key";
DROP INDEX IF EXISTS "concepts_slug_key";
DROP INDEX IF EXISTS "concepts_curriculum_id_key";

-- CreateIndex: tenant-scoped unique constraints
CREATE UNIQUE INDEX "concepts_slug_tenant_id_key" ON "concepts"("slug", "tenant_id");
CREATE UNIQUE INDEX "concepts_curriculum_id_tenant_id_key" ON "concepts"("curriculum_id", "tenant_id");

-- CreateIndex: vault_id index
CREATE INDEX "concepts_vault_id_idx" ON "concepts"("vault_id");

-- CreateIndex: tenant_vaults unique tenant
CREATE UNIQUE INDEX "tenant_vaults_tenant_id_key" ON "tenant_vaults"("tenant_id");

-- CreateIndex: vault_operation_logs indexes
CREATE INDEX "vault_operation_logs_tenant_id_idx" ON "vault_operation_logs"("tenant_id");
CREATE INDEX "vault_operation_logs_operation_type_idx" ON "vault_operation_logs"("operation_type");
CREATE INDEX "vault_operation_logs_created_at_idx" ON "vault_operation_logs"("created_at");

-- AddForeignKey: tenant_vaults -> tenant
ALTER TABLE "tenant_vaults" ADD CONSTRAINT "tenant_vaults_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: concepts -> tenant_vaults
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "tenant_vaults"("id") ON DELETE SET NULL ON UPDATE CASCADE;
