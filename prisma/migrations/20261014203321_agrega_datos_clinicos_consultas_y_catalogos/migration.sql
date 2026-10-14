-- CreateEnum
CREATE TYPE "condition_type" AS ENUM ('pathology', 'allergy', 'intolerance', 'rejection', 'preference');

-- CreateEnum
CREATE TYPE "consultation_type" AS ENUM ('first', 'follow_up');

-- CreateEnum
CREATE TYPE "measurement_type" AS ENUM ('weight', 'height', 'skinfold', 'circumference', 'cholesterol', 'triglycerides', 'glucose', 'other');

-- CreateEnum
CREATE TYPE "habit_compliance" AS ENUM ('pending', 'met', 'partial', 'not_met');

-- CreateEnum
CREATE TYPE "food_category_type" AS ENUM ('protein', 'carbohydrate', 'fiber', 'vegetable', 'healthy_fat', 'infusion');

-- CreateEnum
CREATE TYPE "cooking_method" AS ENUM ('oven', 'stovetop', 'microwave', 'no_cooking');

-- CreateEnum
CREATE TYPE "recipe_origin" AS ENUM ('professional', 'ai_generated');

-- CreateEnum
CREATE TYPE "meal_type" AS ENUM ('breakfast', 'lunch', 'afternoon_snack', 'dinner');

-- AlterTable
ALTER TABLE "patient" ADD COLUMN     "alcohol" TEXT,
ADD COLUMN     "cooking_time" TEXT,
ADD COLUMN     "cooks" BOOLEAN,
ADD COLUMN     "external_treatment" TEXT,
ADD COLUMN     "home_equipment" TEXT,
ADD COLUMN     "intake_patterns" TEXT,
ADD COLUMN     "likes_cooking" BOOLEAN,
ADD COLUMN     "meal_schedule" TEXT,
ADD COLUMN     "meals_outside_home" TEXT,
ADD COLUMN     "medical_history" TEXT,
ADD COLUMN     "medication" TEXT,
ADD COLUMN     "occupation" TEXT,
ADD COLUMN     "outside_equipment" TEXT,
ADD COLUMN     "physical_activity" TEXT,
ADD COLUMN     "sleep_schedule" TEXT,
ADD COLUMN     "smoking" TEXT,
ADD COLUMN     "usual_shopping_place" TEXT,
ADD COLUMN     "work_context" TEXT;

-- CreateTable
CREATE TABLE "pathology" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "pathology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_condition" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "type" "condition_type" NOT NULL,
    "pathology_id" UUID,
    "food_id" UUID,
    "food_group_id" UUID,
    "registered_at" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observations" TEXT,

    CONSTRAINT "patient_condition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "consultation_type" NOT NULL,
    "motivation" TEXT,
    "decision_origin" TEXT,
    "perceived_obstacle" TEXT,
    "main_habit" TEXT,
    "observations" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "consultation_id" UUID,
    "type" "measurement_type" NOT NULL,
    "detail" TEXT,
    "value" DECIMAL(8,2) NOT NULL,
    "unit" TEXT,
    "date" DATE NOT NULL,

    CONSTRAINT "measurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescribed_habit" (
    "id" UUID NOT NULL,
    "consultation_id" UUID NOT NULL,
    "evaluation_consultation_id" UUID,
    "description" TEXT NOT NULL,
    "compliance" "habit_compliance" NOT NULL DEFAULT 'pending',
    "evaluation_observations" TEXT,

    CONSTRAINT "prescribed_habit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_group" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "food_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food" (
    "id" UUID NOT NULL,
    "food_group_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "food_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_category" (
    "id" UUID NOT NULL,
    "food_id" UUID NOT NULL,
    "category" "food_category_type" NOT NULL,

    CONSTRAINT "food_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe" (
    "id" UUID NOT NULL,
    "nutritionist_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "preparation" TEXT,
    "final_note" TEXT,
    "cooking_method" "cooking_method",
    "time_minutes" INTEGER,
    "purchase_place" TEXT,
    "origin" "recipe_origin" NOT NULL DEFAULT 'professional',
    "available_in_catalog" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredient" (
    "id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "food_id" UUID NOT NULL,
    "quantity_description" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "recipe_ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_meal_type" (
    "id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "meal_type" "meal_type" NOT NULL,

    CONSTRAINT "recipe_meal_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_recommendation" (
    "id" UUID NOT NULL,
    "pathology_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "clinical_recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pathology_name_key" ON "pathology"("name");

-- CreateIndex
CREATE INDEX "patient_condition_patient_id_idx" ON "patient_condition"("patient_id");

-- CreateIndex
CREATE INDEX "consultation_patient_id_date_idx" ON "consultation"("patient_id", "date");

-- CreateIndex
CREATE INDEX "measurement_patient_id_type_date_idx" ON "measurement"("patient_id", "type", "date");

-- CreateIndex
CREATE INDEX "prescribed_habit_consultation_id_idx" ON "prescribed_habit"("consultation_id");

-- CreateIndex
CREATE INDEX "prescribed_habit_evaluation_consultation_id_idx" ON "prescribed_habit"("evaluation_consultation_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_group_name_key" ON "food_group"("name");

-- CreateIndex
CREATE INDEX "food_group_parent_id_idx" ON "food_group"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_name_key" ON "food"("name");

-- CreateIndex
CREATE INDEX "food_food_group_id_idx" ON "food"("food_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_category_food_id_category_key" ON "food_category"("food_id", "category");

-- CreateIndex
CREATE INDEX "recipe_nutritionist_id_idx" ON "recipe"("nutritionist_id");

-- CreateIndex
CREATE INDEX "recipe_ingredient_food_id_idx" ON "recipe_ingredient"("food_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_ingredient_recipe_id_order_key" ON "recipe_ingredient"("recipe_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_meal_type_recipe_id_meal_type_key" ON "recipe_meal_type"("recipe_id", "meal_type");

-- CreateIndex
CREATE INDEX "clinical_recommendation_pathology_id_idx" ON "clinical_recommendation"("pathology_id");

-- AddForeignKey
ALTER TABLE "patient_condition" ADD CONSTRAINT "patient_condition_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_condition" ADD CONSTRAINT "patient_condition_pathology_id_fkey" FOREIGN KEY ("pathology_id") REFERENCES "pathology"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_condition" ADD CONSTRAINT "patient_condition_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "food"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_condition" ADD CONSTRAINT "patient_condition_food_group_id_fkey" FOREIGN KEY ("food_group_id") REFERENCES "food_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement" ADD CONSTRAINT "measurement_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement" ADD CONSTRAINT "measurement_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescribed_habit" ADD CONSTRAINT "prescribed_habit_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescribed_habit" ADD CONSTRAINT "prescribed_habit_evaluation_consultation_id_fkey" FOREIGN KEY ("evaluation_consultation_id") REFERENCES "consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_group" ADD CONSTRAINT "food_group_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "food_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food" ADD CONSTRAINT "food_food_group_id_fkey" FOREIGN KEY ("food_group_id") REFERENCES "food_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_category" ADD CONSTRAINT "food_category_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "food"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "nutritionist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredient" ADD CONSTRAINT "recipe_ingredient_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredient" ADD CONSTRAINT "recipe_ingredient_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "food"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_meal_type" ADD CONSTRAINT "recipe_meal_type_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_recommendation" ADD CONSTRAINT "clinical_recommendation_pathology_id_fkey" FOREIGN KEY ("pathology_id") REFERENCES "pathology"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Restricciones que Prisma no expresa (agregadas a mano, T14). Las de condición y
-- medición se validan también en los schemas Zod. Ver
-- docs/decisiones/ajustes-al-modelo-del-anexo-a-incremento-2.md en el repo raíz.
-- ---------------------------------------------------------------------------

-- PatientCondition: alimento y grupo de alimentos son excluyentes.
ALTER TABLE "patient_condition" ADD CONSTRAINT "patient_condition_food_xor_group_chk"
  CHECK (NOT ("food_id" IS NOT NULL AND "food_group_id" IS NOT NULL));

-- PatientCondition: pathology_id existe si y solo si type = 'pathology'.
ALTER TABLE "patient_condition" ADD CONSTRAINT "patient_condition_pathology_chk"
  CHECK (("type" = 'pathology') = ("pathology_id" IS NOT NULL));

-- PatientCondition: una patología no referencia alimentos; las demás condiciones
-- referencian un alimento o un grupo (RF-24).
ALTER TABLE "patient_condition" ADD CONSTRAINT "patient_condition_target_chk"
  CHECK (
    ("type" = 'pathology' AND "food_id" IS NULL AND "food_group_id" IS NULL)
    OR ("type" <> 'pathology' AND ("food_id" IS NOT NULL OR "food_group_id" IS NOT NULL))
  );

-- Measurement: detail obligatorio para los tipos que necesitan precisar qué se midió.
ALTER TABLE "measurement" ADD CONSTRAINT "measurement_detail_chk"
  CHECK ("type" NOT IN ('skinfold', 'circumference', 'other') OR "detail" IS NOT NULL);

ALTER TABLE "measurement" ADD CONSTRAINT "measurement_value_chk" CHECK ("value" > 0);

-- PrescribedHabit: la consulta que evalúa no es la que establece.
ALTER TABLE "prescribed_habit" ADD CONSTRAINT "prescribed_habit_eval_chk"
  CHECK ("evaluation_consultation_id" IS NULL OR "evaluation_consultation_id" <> "consultation_id");

-- FoodGroup: un grupo no es su propio padre (los ciclos largos los valida el servicio).
ALTER TABLE "food_group" ADD CONSTRAINT "food_group_parent_chk" CHECK ("parent_id" <> "id");

-- Recipe: tiempo positivo cuando se carga.
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_time_chk" CHECK ("time_minutes" IS NULL OR "time_minutes" > 0);
