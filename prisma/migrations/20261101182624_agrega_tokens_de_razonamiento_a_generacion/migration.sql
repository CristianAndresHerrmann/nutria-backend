-- AlterTable
ALTER TABLE "ai_generation" ADD COLUMN     "reasoning_tokens" INTEGER;

-- Los tokens de razonamiento entran en el mismo CHECK de métricas no negativas
-- (lo que Prisma no expresa). Son una parte de output_tokens.
ALTER TABLE "ai_generation" DROP CONSTRAINT "ai_generation_metrics_chk";
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_metrics_chk"
  CHECK (
    "duration_ms" >= 0
    AND ("input_tokens" IS NULL OR "input_tokens" >= 0)
    AND ("output_tokens" IS NULL OR "output_tokens" >= 0)
    AND ("reasoning_tokens" IS NULL OR "reasoning_tokens" >= 0)
  );
