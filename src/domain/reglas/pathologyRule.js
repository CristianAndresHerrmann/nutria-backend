const { ConditionType, FindingSeverity, FindingType, RuleSeverity } = require('@prisma/client');
const { ruleScopes } = require('../../utils/recipeConditionFilter');
const { reachedItemText } = require('./directCondition');

// Reglas por patología (RF-43, RF-47; T35). Las reglas son datos en
// clinical_rule (patología → alimento o grupo, severidad, fuente), con su ficha
// en docs/reglas-clinicas.md del repo raíz (R-05). Alcanzan a un ítem con el
// mismo criterio que una condición directa: alimento, ingrediente de receta o
// ítem de grupo dentro del grupo de la regla (DA-23, DA-30).
//
// La severidad de la regla sale de la redacción de su fuente, y define la del
// hallazgo (DA-36): lo que se excluye bloquea; lo que se modera advierte y no
// impide aprobar (RF-44).
const FINDING_SEVERITY = {
  [RuleSeverity.prohibited]: FindingSeverity.blocking,
  [RuleSeverity.moderate]: FindingSeverity.warning,
};

const RULE_LABELS = {
  [RuleSeverity.prohibited]: 'excluido',
  [RuleSeverity.moderate]: 'a moderar',
};

// Los alcances de las reglas de las patologías del paciente, cada uno con el
// nombre de su patología para el mensaje. Las reglas de otras patologías no
// alcanzan nada.
function pathologyRuleScopes(rules, conditions, groups) {
  const pathologyNames = new Map(
    conditions
      .filter((condition) => condition.type === ConditionType.pathology)
      .map((condition) => [condition.pathologyId, condition.pathology.name]),
  );
  return ruleScopes(
    rules.filter((rule) => pathologyNames.has(rule.pathologyId)),
    groups,
  ).map((scope) => ({ ...scope, pathologyName: pathologyNames.get(scope.rule.pathologyId) }));
}

// Un hallazgo por cada regla que alcanza al ítem, en el orden de las reglas.
function pathologyRuleFindings(item, scopes, catalog) {
  const findings = [];
  for (const scope of scopes) {
    const itemText = reachedItemText(item, scope, catalog);
    if (itemText === null) continue;
    const { rule } = scope;
    findings.push({
      type: FindingType.pathology_rule,
      severity: FINDING_SEVERITY[rule.severity],
      optionId: null,
      optionItemId: item.id,
      patientConditionId: null,
      clinicalRuleId: rule.id,
      message: `${itemText}: ${RULE_LABELS[rule.severity]} por ${scope.pathologyName} (${rule.source})`,
    });
  }
  return findings;
}

module.exports = { pathologyRuleScopes, pathologyRuleFindings };
