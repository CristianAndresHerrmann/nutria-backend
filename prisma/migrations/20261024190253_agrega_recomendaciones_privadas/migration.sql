-- AlterTable
ALTER TABLE "clinical_recommendation" ADD COLUMN     "nutritionist_id" UUID;

-- CreateIndex
CREATE INDEX "clinical_recommendation_nutritionist_id_idx" ON "clinical_recommendation"("nutritionist_id");

-- AddForeignKey
ALTER TABLE "clinical_recommendation" ADD CONSTRAINT "clinical_recommendation_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "nutritionist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
