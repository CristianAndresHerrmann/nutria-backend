-- CreateEnum
CREATE TYPE "plan_status" AS ENUM ('draft');

-- CreateEnum
CREATE TYPE "option_item_type" AS ENUM ('food', 'food_group', 'recipe', 'unrecognized');

-- CreateEnum
CREATE TYPE "rule_severity" AS ENUM ('prohibited', 'moderate');

-- CreateEnum
CREATE TYPE "finding_type" AS ENUM ('direct_condition', 'pathology_rule', 'composition', 'unrecognized_item');

-- CreateEnum
CREATE TYPE "finding_severity" AS ENUM ('blocking', 'warning');

-- CreateEnum
CREATE TYPE "ai_generation_result" AS ENUM ('success', 'invalid_response', 'provider_error', 'timeout');

-- CreateEnum
CREATE TYPE "ai_validation_result" AS ENUM ('no_findings', 'warnings', 'blocking');

-- AlterTable
ALTER TABLE "recipe" ADD COLUMN     "origin_plan_id" UUID;

-- CreateTable
CREATE TABLE "plan" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "nutritionist_id" UUID NOT NULL,
    "status" "plan_status" NOT NULL DEFAULT 'draft',
    "situational_diagnosis" TEXT,
    "introduction" TEXT,
    "objectives" TEXT,
    "general_recommendations" TEXT,
    "contextual_recommendations" TEXT,
    "clinical_recommendations" TEXT,
    "thematic_recommendations" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_meal" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "meal_type" "meal_type" NOT NULL,
    "instructions" TEXT,

    CONSTRAINT "plan_meal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_option" (
    "id" UUID NOT NULL,
    "plan_meal_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "description" TEXT,

    CONSTRAINT "meal_option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_item" (
    "id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "option_item_type" NOT NULL,
    "food_id" UUID,
    "food_name" TEXT,
    "food_categories" "food_category_type"[] DEFAULT ARRAY[]::"food_category_type"[],
    "food_group_id" UUID,
    "food_group_name" TEXT,
    "recipe_id" UUID,
    "original_text" TEXT,

    CONSTRAINT "option_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_rule" (
    "id" UUID NOT NULL,
    "pathology_id" UUID NOT NULL,
    "food_id" UUID,
    "food_group_id" UUID,
    "severity" "rule_severity" NOT NULL,
    "source" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "clinical_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "option_id" UUID,
    "option_item_id" UUID,
    "type" "finding_type" NOT NULL,
    "severity" "finding_severity" NOT NULL,
    "clinical_rule_id" UUID,
    "patient_condition_id" UUID,
    "message" TEXT NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_generation" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "context_sent" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "template_version" TEXT NOT NULL,
    "raw_response" TEXT,
    "duration_ms" INTEGER NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "result" "ai_generation_result" NOT NULL,
    "validation_result" "ai_validation_result",
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_generation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_patient_id_idx" ON "plan"("patient_id");

-- CreateIndex
CREATE INDEX "plan_nutritionist_id_idx" ON "plan"("nutritionist_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_meal_plan_id_meal_type_key" ON "plan_meal"("plan_id", "meal_type");

-- CreateIndex
CREATE UNIQUE INDEX "meal_option_plan_meal_id_order_key" ON "meal_option"("plan_meal_id", "order");

-- CreateIndex
CREATE INDEX "option_item_food_id_idx" ON "option_item"("food_id");

-- CreateIndex
CREATE INDEX "option_item_food_group_id_idx" ON "option_item"("food_group_id");

-- CreateIndex
CREATE INDEX "option_item_recipe_id_idx" ON "option_item"("recipe_id");

-- CreateIndex
CREATE UNIQUE INDEX "option_item_option_id_order_key" ON "option_item"("option_id", "order");

-- CreateIndex
CREATE INDEX "clinical_rule_pathology_id_idx" ON "clinical_rule"("pathology_id");

-- CreateIndex
CREATE INDEX "clinical_rule_food_id_idx" ON "clinical_rule"("food_id");

-- CreateIndex
CREATE INDEX "clinical_rule_food_group_id_idx" ON "clinical_rule"("food_group_id");

-- CreateIndex
CREATE INDEX "finding_plan_id_idx" ON "finding"("plan_id");

-- CreateIndex
CREATE INDEX "finding_option_id_idx" ON "finding"("option_id");

-- CreateIndex
CREATE INDEX "finding_option_item_id_idx" ON "finding"("option_item_id");

-- CreateIndex
CREATE INDEX "finding_clinical_rule_id_idx" ON "finding"("clinical_rule_id");

-- CreateIndex
CREATE INDEX "finding_patient_condition_id_idx" ON "finding"("patient_condition_id");

-- CreateIndex
CREATE INDEX "ai_generation_plan_id_idx" ON "ai_generation"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_id_nutritionist_id_key" ON "patient"("id", "nutritionist_id");

-- CreateIndex
CREATE INDEX "recipe_origin_plan_id_idx" ON "recipe"("origin_plan_id");

-- AddForeignKey
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_origin_plan_id_fkey" FOREIGN KEY ("origin_plan_id") REFERENCES "plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan" ADD CONSTRAINT "plan_patient_id_nutritionist_id_fkey" FOREIGN KEY ("patient_id", "nutritionist_id") REFERENCES "patient"("id", "nutritionist_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan" ADD CONSTRAINT "plan_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "nutritionist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_meal" ADD CONSTRAINT "plan_meal_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_option" ADD CONSTRAINT "meal_option_plan_meal_id_fkey" FOREIGN KEY ("plan_meal_id") REFERENCES "plan_meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_item" ADD CONSTRAINT "option_item_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "meal_option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_item" ADD CONSTRAINT "option_item_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "food"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_item" ADD CONSTRAINT "option_item_food_group_id_fkey" FOREIGN KEY ("food_group_id") REFERENCES "food_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_item" ADD CONSTRAINT "option_item_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_rule" ADD CONSTRAINT "clinical_rule_pathology_id_fkey" FOREIGN KEY ("pathology_id") REFERENCES "pathology"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_rule" ADD CONSTRAINT "clinical_rule_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "food"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_rule" ADD CONSTRAINT "clinical_rule_food_group_id_fkey" FOREIGN KEY ("food_group_id") REFERENCES "food_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding" ADD CONSTRAINT "finding_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding" ADD CONSTRAINT "finding_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "meal_option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding" ADD CONSTRAINT "finding_option_item_id_fkey" FOREIGN KEY ("option_item_id") REFERENCES "option_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding" ADD CONSTRAINT "finding_clinical_rule_id_fkey" FOREIGN KEY ("clinical_rule_id") REFERENCES "clinical_rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding" ADD CONSTRAINT "finding_patient_condition_id_fkey" FOREIGN KEY ("patient_condition_id") REFERENCES "patient_condition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Restricciones que Prisma no expresa (agregadas a mano, T32). La del ítem se valida
-- también en src/schemas/plan.schema.js. Ver
-- docs/decisiones/ajustes-al-modelo-del-anexo-a-incremento-3.md en el repo raíz.
-- Un CHECK que evalúa a NULL se cumple: cada condición se arma con IS [NOT] NULL o
-- coalesce para que nunca dé NULL.
-- ---------------------------------------------------------------------------

-- OptionItem: cada tipo referencia exactamente lo suyo (DA-19). food y food_group
-- llevan la copia del nombre (DA-16); unrecognized, el texto original no vacío.
ALTER TABLE "option_item" ADD CONSTRAINT "option_item_type_chk"
  CHECK (
    ("type" = 'food'
      AND "food_id" IS NOT NULL AND "food_name" IS NOT NULL
      AND "food_group_id" IS NULL AND "food_group_name" IS NULL
      AND "recipe_id" IS NULL AND "original_text" IS NULL)
    OR ("type" = 'food_group'
      AND "food_group_id" IS NOT NULL AND "food_group_name" IS NOT NULL
      AND "food_id" IS NULL AND "food_name" IS NULL AND coalesce(cardinality("food_categories"), 0) = 0
      AND "recipe_id" IS NULL AND "original_text" IS NULL)
    OR ("type" = 'recipe'
      AND "recipe_id" IS NOT NULL
      AND "food_id" IS NULL AND "food_name" IS NULL AND coalesce(cardinality("food_categories"), 0) = 0
      AND "food_group_id" IS NULL AND "food_group_name" IS NULL
      AND "original_text" IS NULL)
    OR ("type" = 'unrecognized'
      AND "original_text" IS NOT NULL AND coalesce(btrim("original_text"), '') <> ''
      AND "food_id" IS NULL AND "food_name" IS NULL AND coalesce(cardinality("food_categories"), 0) = 0
      AND "food_group_id" IS NULL AND "food_group_name" IS NULL
      AND "recipe_id" IS NULL)
  );

-- ClinicalRule: restringe exactamente un alimento o un grupo, y cita su fuente (RF-47).
ALTER TABLE "clinical_rule" ADD CONSTRAINT "clinical_rule_target_chk"
  CHECK (("food_id" IS NULL) <> ("food_group_id" IS NULL));

ALTER TABLE "clinical_rule" ADD CONSTRAINT "clinical_rule_source_chk"
  CHECK (btrim("source") <> '');

-- Finding: cada tipo señala lo que lo origina. Los de restricción señalan un ítem;
-- los de composición, una opción. La severidad la decide el motor de reglas.
ALTER TABLE "finding" ADD CONSTRAINT "finding_origin_chk"
  CHECK (
    ("type" = 'direct_condition'
      AND "option_item_id" IS NOT NULL AND "patient_condition_id" IS NOT NULL
      AND "clinical_rule_id" IS NULL AND "option_id" IS NULL)
    OR ("type" = 'pathology_rule'
      AND "option_item_id" IS NOT NULL AND "clinical_rule_id" IS NOT NULL
      AND "patient_condition_id" IS NULL AND "option_id" IS NULL)
    OR ("type" = 'composition'
      AND "option_id" IS NOT NULL
      AND "option_item_id" IS NULL AND "clinical_rule_id" IS NULL AND "patient_condition_id" IS NULL)
    OR ("type" = 'unrecognized_item'
      AND "option_item_id" IS NOT NULL
      AND "clinical_rule_id" IS NULL AND "patient_condition_id" IS NULL AND "option_id" IS NULL)
  );

-- AiGeneration: métricas no negativas; la respuesta cruda existe cuando el proveedor
-- respondió; el resultado de la validación, solo si la respuesta se pudo usar.
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_metrics_chk"
  CHECK (
    "duration_ms" >= 0
    AND ("input_tokens" IS NULL OR "input_tokens" >= 0)
    AND ("output_tokens" IS NULL OR "output_tokens" >= 0)
  );

ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_response_chk"
  CHECK ("result" NOT IN ('success', 'invalid_response') OR "raw_response" IS NOT NULL);

ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_validation_chk"
  CHECK ("validation_result" IS NULL OR "result" = 'success');

