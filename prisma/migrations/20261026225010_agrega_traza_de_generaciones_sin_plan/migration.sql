-- T37 (DA-31, modifica DA-27): una generación fallida queda registrada sin plan,
-- colgada de su paciente. El plan se crea solo cuando la generación salió bien.
--
-- Las columnas nuevas se agregan nullable y se completan desde el plan antes del
-- NOT NULL, así la migración no falla sobre una base con generaciones ya
-- registradas (hasta T37 todas tenían plan).

-- AlterTable
ALTER TABLE "ai_generation" ADD COLUMN     "nutritionist_id" UUID,
ADD COLUMN     "patient_id" UUID,
ALTER COLUMN "plan_id" DROP NOT NULL;

UPDATE "ai_generation" AS g
SET "patient_id" = p."patient_id", "nutritionist_id" = p."nutritionist_id"
FROM "plan" AS p
WHERE p."id" = g."plan_id";

ALTER TABLE "ai_generation" ALTER COLUMN "nutritionist_id" SET NOT NULL,
ALTER COLUMN "patient_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "ai_generation_patient_id_idx" ON "ai_generation"("patient_id");

-- CreateIndex
CREATE INDEX "ai_generation_nutritionist_id_idx" ON "ai_generation"("nutritionist_id");

-- AddForeignKey
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_patient_id_nutritionist_id_fkey" FOREIGN KEY ("patient_id", "nutritionist_id") REFERENCES "patient"("id", "nutritionist_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "nutritionist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AiGeneration: el plan existe si y solo si la generación salió bien. result es
-- NOT NULL, así que la comparación nunca da NULL.
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_plan_chk"
  CHECK (("result" = 'success') = ("plan_id" IS NOT NULL));
