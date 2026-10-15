-- Agregado a mano (T15): citext hace que el @unique de name no distinga
-- mayúsculas en food, food_group y pathology. Prisma no crea extensiones sin el
-- preview feature postgresqlExtensions, y tampoco las compara al detectar drift.
CREATE EXTENSION IF NOT EXISTS citext;

-- AlterTable
ALTER TABLE "food" ADD COLUMN     "created_by_id" UUID,
ALTER COLUMN "name" SET DATA TYPE CITEXT;

-- AlterTable
ALTER TABLE "food_group" ADD COLUMN     "created_by_id" UUID,
ALTER COLUMN "name" SET DATA TYPE CITEXT;

-- AlterTable
ALTER TABLE "pathology" ADD COLUMN     "created_by_id" UUID,
ALTER COLUMN "name" SET DATA TYPE CITEXT;

-- AddForeignKey
ALTER TABLE "pathology" ADD CONSTRAINT "pathology_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "nutritionist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_group" ADD CONSTRAINT "food_group_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "nutritionist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food" ADD CONSTRAINT "food_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "nutritionist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
