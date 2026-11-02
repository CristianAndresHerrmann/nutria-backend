-- AlterTable
ALTER TABLE "food" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by_id" UUID;

-- CreateIndex
CREATE INDEX "food_created_by_id_idx" ON "food"("created_by_id");

-- AddForeignKey
ALTER TABLE "food" ADD CONSTRAINT "food_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "nutritionist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Los privados que ya existen los cargó su dueño. Los comunes vienen del seed y
-- quedan sin autor. created_at de las filas existentes es la fecha de esta
-- migración: no hay un dato anterior del que tomarla.
UPDATE "food" SET "created_by_id" = "nutritionist_id" WHERE "nutritionist_id" IS NOT NULL;
