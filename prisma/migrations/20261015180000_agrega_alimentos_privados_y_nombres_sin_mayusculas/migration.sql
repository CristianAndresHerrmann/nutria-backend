-- Agregado a mano (T15): citext hace que la unicidad de name no distinga
-- mayúsculas en food, food_group y pathology. Prisma no crea extensiones sin el
-- preview feature postgresqlExtensions, y tampoco las compara al detectar drift.
CREATE EXTENSION IF NOT EXISTS citext;

-- DropIndex
DROP INDEX "food_name_key";

-- AlterTable
ALTER TABLE "food" ADD COLUMN     "nutritionist_id" UUID,
ALTER COLUMN "name" SET DATA TYPE CITEXT;

-- AlterTable
ALTER TABLE "food_group" ALTER COLUMN "name" SET DATA TYPE CITEXT;

-- AlterTable
ALTER TABLE "pathology" ALTER COLUMN "name" SET DATA TYPE CITEXT;

-- CreateIndex
CREATE UNIQUE INDEX "food_nutritionist_id_name_key" ON "food"("nutritionist_id", "name");

-- AddForeignKey
ALTER TABLE "food" ADD CONSTRAINT "food_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "nutritionist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

