-- AlterTable
ALTER TABLE "patient" ADD COLUMN     "cooking_minutes_per_day" INTEGER,
ADD COLUMN     "has_microwave" BOOLEAN,
ADD COLUMN     "has_oven" BOOLEAN,
ADD COLUMN     "has_stovetop" BOOLEAN;

-- Minutos por día para cocinar (T62): positivos y dentro de un día. La API lo
-- valida con Zod (patient.schema.js) para responder 400 por campo.
ALTER TABLE "patient" ADD CONSTRAINT "patient_cooking_minutes_per_day_chk" CHECK ("cooking_minutes_per_day" IS NULL OR ("cooking_minutes_per_day" > 0 AND "cooking_minutes_per_day" <= 1440));
