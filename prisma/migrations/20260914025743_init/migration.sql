-- CreateTable
CREATE TABLE "nutritionist" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,

    CONSTRAINT "nutritionist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient" (
    "id" UUID NOT NULL,
    "nutritionist_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "birth_date" DATE,
    "phone" TEXT,
    "email" TEXT,
    "lives_with" TEXT,
    "goal" TEXT,
    "reference_weight" DECIMAL(5,2),
    "guardian_name" TEXT,
    "guardian_relationship" TEXT,
    "guardian_contact" TEXT,
    "attends_accompanied" BOOLEAN,
    "registration_complete" BOOLEAN NOT NULL DEFAULT false,
    "data_completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nutritionist_email_key" ON "nutritionist"("email");

-- AddForeignKey
ALTER TABLE "patient" ADD CONSTRAINT "patient_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "nutritionist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
