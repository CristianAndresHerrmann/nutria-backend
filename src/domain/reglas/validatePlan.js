const { AiValidationResult, FindingSeverity, FindingType, MealType, OptionItemType } = require('@prisma/client');
const { conditionScopes } = require('../../utils/recipeConditionFilter');
const { indexCatalog } = require('./catalogIndex');
const { directConditionFindings } = require('./directCondition');
const { itemCategories } = require('./itemCategories');
const { missingCategories } = require('./mealComposition');

// Motor de reglas determinístico, v1 (T34). Función pura: (plan, condiciones
// del paciente, catálogo) → hallazgos. Corre igual en cada guardado y los
// hallazgos se reemplazan, nunca se descartan a mano (RF-46). Detalle en el
// skill reglas-clinicas-deterministicas y en docs/decisiones/motor-de-reglas-v1.md
// en el repo raíz (DA-30).
//
// Cada hallazgo tiene las columnas de Finding salvo planId, armado para cumplir
// finding_origin_chk: los de ítem no llevan optionId y el de composición no
// lleva ítem. Orden: comidas por tipo, opciones e ítems por posición; dentro de
// un ítem, no reconocido y después condiciones; la composición al final de cada
// opción.

const MEAL_ORDER = Object.values(MealType);

const MEAL_LABELS = {
  breakfast: 'del desayuno',
  lunch: 'del almuerzo',
  afternoon_snack: 'de la merienda',
  dinner: 'de la cena',
};

const CATEGORY_LABELS = {
  protein: 'proteína',
  carbohydrate: 'hidrato',
  fiber: 'fibra',
  vegetable: 'verdura',
  healthy_fat: 'grasa saludable',
  infusion: 'infusión',
};

const byOrder = (a, b) => a.order - b.order;

function joinLabels(labels) {
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
}

// DA-30: no se puede validar hasta que se reemplace por un alimento, un grupo o
// una receta del catálogo (RF-43 opera sobre datos estructurados).
function unrecognizedItemFinding(item) {
  return {
    type: FindingType.unrecognized_item,
    severity: FindingSeverity.blocking,
    optionId: null,
    optionItemId: item.id,
    patientConditionId: null,
    message: `"${item.originalText}" no está en el catálogo y no se puede validar hasta reemplazarlo por un alimento, un grupo o una receta`,
  };
}

// Composición esperada (RF-44, configuración de T27): advertencia, nunca bloqueo.
// position es el número de la opción dentro de su comida, contando desde 1.
function compositionFinding(mealType, option, position, items, catalog) {
  const missing = missingCategories(
    mealType,
    items.map((item) => ({ categories: itemCategories(item, catalog) })),
  );
  if (missing.length === 0) return null;

  return {
    type: FindingType.composition,
    severity: FindingSeverity.warning,
    optionId: option.id,
    optionItemId: null,
    patientConditionId: null,
    message: `Opción ${position} ${MEAL_LABELS[mealType]}: falta ${joinLabels(missing.map((category) => CATEGORY_LABELS[category]))}`,
  };
}

function validatePlan({ plan, conditions, catalog }) {
  const catalogIndex = indexCatalog(catalog);
  const scopes = conditionScopes(conditions, catalog.groups);
  const meals = [...plan.meals].sort((a, b) => MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType));
  const findings = [];

  for (const meal of meals) {
    for (const [index, option] of [...meal.options].sort(byOrder).entries()) {
      const items = [...option.items].sort(byOrder);

      for (const item of items) {
        if (item.type === OptionItemType.unrecognized) findings.push(unrecognizedItemFinding(item));
        findings.push(...directConditionFindings(item, scopes, catalogIndex));
      }

      const composition = compositionFinding(meal.mealType, option, index + 1, items, catalogIndex);
      if (composition) findings.push(composition);
    }
  }

  return findings;
}

// Resumen para GENERACION_IA.resultado_validacion (RF-41): la propuesta tal
// como llegó, con bloqueos, solo con advertencias o sin hallazgos.
function validationResult(findings) {
  if (findings.some((finding) => finding.severity === FindingSeverity.blocking)) return AiValidationResult.blocking;
  if (findings.length > 0) return AiValidationResult.warnings;
  return AiValidationResult.no_findings;
}

module.exports = { validatePlan, validationResult };
