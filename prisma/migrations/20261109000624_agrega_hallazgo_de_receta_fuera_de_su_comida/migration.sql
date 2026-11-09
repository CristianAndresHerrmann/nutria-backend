-- Hallazgo por receta fuera de su tipo de comida (R-06, T54; DA-40).

-- AlterEnum
ALTER TYPE "finding_type" ADD VALUE 'meal_type_mismatch';

-- Finding: el hallazgo nuevo señala un ítem, como el no reconocido. Postgres no
-- deja usar un valor de enum recién agregado dentro de la misma transacción, así
-- que la rama nueva compara el tipo como texto.
ALTER TABLE "finding" DROP CONSTRAINT "finding_origin_chk";
ALTER TABLE "finding" ADD CONSTRAINT "finding_origin_chk"
  CHECK (
    ("type" = 'direct_condition'
      AND "option_item_id" IS NOT NULL AND "patient_condition_id" IS NOT NULL
      AND "clinical_rule_id" IS NULL AND "option_id" IS NULL)
    OR ("type" = 'pathology_rule'
      AND "option_item_id" IS NOT NULL AND "clinical_rule_id" IS NOT NULL
      AND "patient_condition_id" IS NULL AND "option_id" IS NULL)
    OR ("type" = 'composition'
      AND "option_id" IS NOT NULL
      AND "option_item_id" IS NULL AND "clinical_rule_id" IS NULL AND "patient_condition_id" IS NULL)
    OR ("type" = 'unrecognized_item'
      AND "option_item_id" IS NOT NULL
      AND "clinical_rule_id" IS NULL AND "patient_condition_id" IS NULL AND "option_id" IS NULL)
    OR ("type"::text = 'meal_type_mismatch'
      AND "option_item_id" IS NOT NULL
      AND "clinical_rule_id" IS NULL AND "patient_condition_id" IS NULL AND "option_id" IS NULL)
  );
