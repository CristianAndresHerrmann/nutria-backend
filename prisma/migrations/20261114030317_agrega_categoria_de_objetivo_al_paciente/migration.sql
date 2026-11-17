-- CreateEnum
CREATE TYPE "goal_category" AS ENUM ('lose_weight', 'other');

-- AlterTable
ALTER TABLE "patient" ADD COLUMN     "goal_category" "goal_category";
