-- CreateEnum
CREATE TYPE "account_role" AS ENUM ('nutritionist', 'admin');

-- AlterTable
ALTER TABLE "nutritionist" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "role" "account_role" NOT NULL DEFAULT 'nutritionist';
