const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { CLINICAL_CASES } = require('./seed-data/clinical-cases');
const { CONTROL_RECIPE_NAMES } = require('./seed-data/private-recipes');
const { PLAN_USAGE_TEXT } = require('../src/domain/generacion/planTexts');
const { indexCatalog } = require('../src/domain/reglas/catalogIndex');
const {
  COMPARED_CATEGORIES,
  MEAL_TYPES,
  optionKinds,
  incompleteOptions,
  recipeRepeats,
  feasibility,
  feasibilityProfile,
  categoryShares,
  findingsByType,
} = require('./proposal-metrics');
const { GUIDELINE_IDS, createGuidelineEvaluator, sumGuidelines, goalCategoryFor } = require('./adequacy-guidelines');

// Medición de la generación del plan (T41; Tabla 7 del IA2, riesgos 4, 10 y 17).
// Corre N generaciones por caso clínico del seed contra el stack levantado, en
// serie, con el proveedor que tenga configurado nutria-ia. Se lanza a mano
// (`npm run measure:generation` en la raíz): no es parte de ninguna suite, y
// con un proveedor real cada generación tiene costo.
//
// Por generación registra:
// - El tiempo total, desde la solicitud hasta la propuesta validada y guardada
//   (lo que espera el editor), medido acá alrededor del POST.
// - La duración del proveedor y los tokens, de la traza ai_generation (RF-41):
//   la API no los expone, y la traza también existe para las fallas que
//   llegaron al proveedor.
// - Si la salida cumplió el contrato y si la propuesta tiene hallazgos
//   bloqueantes (meta del 95 %).
// - Qué recetas propuso frente a las candidatas que se le ofrecieron: propias o
//   comunes, de control, y si alguna cayó en una comida para la que no se ofrece,
//   algo que ni el motor ni la edición controlan.
// - La validez nutricional de la propuesta (T58, evaluadores del Inc. 4): tipo de
//   opción (receta o armada), recetas repetidas, recetas que no se pueden hacer
//   con el equipamiento del caso (las que superan sus minutos por día se cuentan
//   solo como dato, DA-50), categorías por comida y
//   cumplimiento de las pautas de adecuación (T57). Ver proposal-metrics.js y
//   adequacy-guidelines.js.
// Con --goal (repetible) y un solo caso, corre el experimento de objetivo:
// cambia el objetivo del paciente antes de cada generación y lo restaura al final.
// Escribe el resultado en JSON (repo raíz, docs/mediciones-de-generacion/) e
// imprime el resumen en Markdown.

const CASES_ACCOUNT = 'nutricionista@nutria.com';
const DEFAULT_API_URL = 'http://backend:3000';
// N=10 en toda corrida que defina algo (T58).
const DEFAULT_ITERATIONS = 10;
// El tope de patient.goal en la API (patient.schema.js).
const GOAL_MAX_LENGTH = 255;
const TIME_GOAL_MS = 15000;
const NO_BLOCKING_GOAL = 0.95;
const TIME_ZONE = 'America/Argentina/Buenos_Aires';
// Los seis textos que redacta la IA (DA-28). Las recomendaciones clínicas salen
// del catálogo, no del modelo.
const AI_TEXT_FIELDS = [
  'situationalDiagnosis',
  'introduction',
  'objectives',
  'generalRecommendations',
  'contextualRecommendations',
  'thematicRecommendations',
];

// Caracteres que escribió la IA. Las generales empiezan con el texto fijo de uso
// del plan (DA-43), que no cuenta: así el número se compara con las corridas
// anteriores.
function aiTextChars(plan) {
  return AI_TEXT_FIELDS.reduce((total, field) => {
    const text = plan[field] ?? '';
    const fromIa =
      field === 'generalRecommendations' && text.startsWith(PLAN_USAGE_TEXT) ? text.slice(PLAN_USAGE_TEXT.length).trim() : text;
    return total + fromIa.length;
  }, 0);
}

// USD por millón de tokens, tarifa estándar del tier pago, consultada el
// 01/11/2026 en las páginas oficiales. Los tokens de salida incluyen el
// razonamiento en los dos proveedores (ver adaptadores-de-proveedores-de-ia.md).
const PRICES = {
  'fake-deterministic': { input: 0, output: 0 },
  'gemini-3.8-flash': {
    input: 0.75,
    output: 3.75,
    source: 'https://ai.google.dev/gemini-api/docs/pricing',
    note: 'Hasta el 31/12/2026; desde el 01/01/2027, 1,50 y 7,50',
  },
  'gpt-6-luna': { input: 0.1, output: 0.5, source: 'https://developers.openai.com/api/docs/models/gpt-6-luna' },
};

// Rango más cercano: el valor en la posición ceil(p · n) de la muestra
// ordenada. Siempre es una medición real, sin interpolar.
function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

function stats(values) {
  const present = values.filter((value) => typeof value === 'number');
  if (present.length === 0) return { n: 0, mean: null, p50: null, p95: null, max: null };
  return {
    n: present.length,
    mean: Math.round(present.reduce((sum, value) => sum + value, 0) / present.length),
    p50: percentile(present, 50),
    p95: percentile(present, 95),
    max: Math.max(...present),
  };
}

function estimateCost(model, inputTokens, outputTokens, prices = PRICES) {
  const price = prices[model];
  if (!price || inputTokens == null || outputTokens == null) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1e6;
}

// Cada caso, por nombre y apellido, entre los pacientes de la cuenta.
function matchCases(cases, patients) {
  const missing = [];
  const matched = cases.map(({ code, title, patient }) => {
    const { firstName, lastName } = patient.data;
    const found = patients.find((candidate) => candidate.firstName === firstName && candidate.lastName === lastName);
    if (!found) missing.push(`${code} (${firstName} ${lastName})`);
    return { code, title, patientId: found?.id };
  });
  if (missing.length > 0) {
    throw new Error(`Faltan casos en ${CASES_ACCOUNT}: ${missing.join(', ')}. Corré npm run db:seed.`);
  }
  return matched;
}

const ratio = (count, total) => (total === 0 ? null : count / total);
const sum = (values) => values.reduce((total, value) => total + value, 0);

// Intervalo de Wilson al 95 % de una proporción: el rango en el que se espera la
// tasa real con esa cantidad de muestras. Con N=10 por caso es ancho, y sirve
// para no atribuirle a un cambio una diferencia que es ruido (T58: cada cambio
// se mide solo). Para los indicadores por opción es optimista: las opciones de
// una misma propuesta no son independientes.
function wilson(count, total, z = 1.96) {
  if (!total) return null;
  const p = count / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denominator;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

// Le agrega el intervalo a cada indicador { num, den } de las pautas sumadas.
function withIntervals(guidelines) {
  const annotate = (value) => value && { ...value, interval: wilson(value.num, value.den) };
  return Object.fromEntries(
    Object.entries(guidelines).map(([id, total]) => [
      id,
      {
        ...total,
        ...(total.main ? { main: annotate(total.main) } : {}),
        ...(total.indicators
          ? { indicators: Object.fromEntries(Object.entries(total.indicators).map(([name, value]) => [name, annotate(value)])) }
          : {}),
      },
    ]),
  );
}

// Suma objetos de contadores anidados ({ lunch: { options: 3, categories: { … } } }).
function addCounts(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'number') target[key] = (target[key] ?? 0) + value;
    else if (value && typeof value === 'object' && !Array.isArray(value)) addCounts((target[key] ??= {}), value);
  }
  return target;
}

// La validez nutricional de las propuestas evaluadas (T58), sumada.
function summarizeEvaluations(evaluations) {
  const optionsByMeal = evaluations.reduce((total, { optionKinds: kinds }) => addCounts(total, kinds), {});
  const feasibilities = evaluations.map(({ feasibility: result }) => result).filter(Boolean);
  return {
    proposals: evaluations.length,
    optionKinds: {
      byMeal: optionsByMeal,
      total: Object.values(optionsByMeal).reduce((total, counts) => addCounts(total, counts), {}),
    },
    recipeRepeats: {
      proposalsWithRepeats: evaluations.filter(({ recipeRepeats: repeats }) => repeats.repeated > 0).length,
      repeated: sum(evaluations.map(({ recipeRepeats: repeats }) => repeats.repeated)),
      betweenMeals: sum(evaluations.map(({ recipeRepeats: repeats }) => repeats.betweenMeals)),
      withinMeal: sum(evaluations.map(({ recipeRepeats: repeats }) => repeats.withinMeal)),
    },
    feasibility:
      feasibilities.length === 0
        ? null
        : feasibilities.reduce(
            (total, { recipeItems, equipment, time, unknown, infeasible }) =>
              addCounts(total, { recipeItems, equipment, time, unknown, infeasible }),
            {},
          ),
    categoryShares: evaluations.reduce((total, { categoryShares: shares }) => addCounts(total, shares), {}),
    guidelines: withIntervals(sumGuidelines(evaluations.map(({ guidelines }) => guidelines))),
  };
}

// Los tiempos son los de las generaciones válidas: la meta mide hasta la
// propuesta validada. Las fallas se cuentan por su reason. Los tokens y el
// costo suman también las fallas con traza, porque el proveedor las cobra.
function summarize(generations) {
  const valid = generations.filter(({ status }) => status === 201);
  const failures = {};
  for (const { status, reason } of generations) {
    if (status !== 201) failures[reason ?? `http_${status}`] = (failures[reason ?? `http_${status}`] ?? 0) + 1;
  }
  const noBlocking = valid.filter(({ validationResult }) => validationResult !== 'blocking').length;
  const traced = generations.filter(({ inputTokens }) => inputTokens != null);
  const costs = generations.map(({ cost }) => cost).filter((cost) => cost != null);
  const totalMs = stats(valid.map(({ totalMs: ms }) => ms));
  const audits = valid.map(({ recipeAudit }) => recipeAudit).filter(Boolean);
  const proposed = audits.flatMap((audit) => audit.proposed);

  return {
    attempts: generations.length,
    valid: valid.length,
    validRate: ratio(valid.length, generations.length),
    failures,
    noBlocking,
    noBlockingRateOfValid: ratio(noBlocking, valid.length),
    noBlockingRateOfAttempts: ratio(noBlocking, generations.length),
    noBlockingInterval: wilson(noBlocking, generations.length),
    noFindings: valid.filter(({ validationResult }) => validationResult === 'no_findings').length,
    totalMs,
    providerMs: stats(valid.map(({ providerMs }) => providerMs)),
    overheadMs: stats(valid.map(({ overheadMs }) => overheadMs)),
    inputTokens: stats(traced.map(({ inputTokens }) => inputTokens)),
    outputTokens: stats(traced.map(({ outputTokens }) => outputTokens)),
    // Parte de los de salida; null en las trazas anteriores a la columna.
    reasoningTokens: stats(traced.map(({ reasoningTokens }) => reasoningTokens)),
    // El tamaño de la propuesta: lo que cambia al pedir menos razonamiento o una
    // salida más corta.
    options: stats(valid.map(({ options }) => options)),
    textChars: stats(valid.map(({ textChars }) => textChars)),
    recipes: {
      candidates: stats(audits.map(({ candidates }) => candidates)),
      proposed: proposed.length,
      own: proposed.filter(({ own }) => own).length,
      control: proposed.filter(({ control }) => control).length,
      notOffered: proposed.filter(({ offered }) => !offered).length,
      wrongMeal: proposed.filter(({ offered, mealMatches }) => offered && !mealMatches).length,
    },
    cost: { total: costs.length > 0 ? sum(costs) : null, perAttempt: costs.length > 0 ? sum(costs) / costs.length : null },
    findings: findingsByType(valid.flatMap(({ findings }) => findings ?? [])),
    evaluation: summarizeEvaluations(valid.map(({ evaluation }) => evaluation).filter(Boolean)),
    goals: {
      p95UnderTimeGoal: totalMs.p95 == null ? null : totalMs.p95 <= TIME_GOAL_MS,
      noBlockingAtLeastGoal:
        generations.length === 0 ? null : ratio(noBlocking, generations.length) >= NO_BLOCKING_GOAL,
    },
  };
}

function groupBy(generations, keyOf) {
  const groups = {};
  for (const generation of generations) (groups[keyOf(generation)] ??= []).push(generation);
  return groups;
}

// Por caso y global. Si el proveedor cambió a mitad de la corrida (se recreó
// nutria-ia con otro .env), el global por modelo es el que vale.
function summarizeRun(generations) {
  const byCase = Object.fromEntries(
    Object.entries(groupBy(generations, ({ caseCode }) => caseCode)).map(([code, rows]) => [code, summarize(rows)]),
  );
  const models = [...new Set(generations.map(({ model }) => model).filter(Boolean))];
  const summary = { models, overall: summarize(generations), byCase };
  if (models.length > 1) {
    summary.byModel = Object.fromEntries(
      Object.entries(groupBy(generations, ({ model }) => model ?? 'sin traza')).map(([model, rows]) => [
        model,
        summarize(rows),
      ]),
    );
  }
  // Experimento de objetivo: el mismo paciente con varios objetivos.
  if (generations.some(({ patientGoal }) => patientGoal != null)) {
    summary.byPatientGoal = Object.fromEntries(
      Object.entries(groupBy(generations, ({ patientGoal }) => patientGoal)).map(([goal, rows]) => [goal, summarize(rows)]),
    );
  }
  return summary;
}

// La evaluación de una propuesta válida (T58). inputs es lo que se arma una vez
// por caso en main: el catálogo indexado, el evaluador de pautas, las patologías
// del paciente y su perfil de factibilidad. Los ítems con hallazgo bloqueante no
// cuentan para las pautas (CM-03).
function evaluateProposal(plan, { catalog, evaluator, pathologies, profile }, { goal = null, goalCategory = null } = {}) {
  const blockingItemIds = new Set(
    (plan.findings ?? [])
      .filter(({ severity, optionItemId }) => severity === 'blocking' && optionItemId)
      .map(({ optionItemId }) => optionItemId),
  );
  return {
    optionKinds: optionKinds(plan, incompleteOptions(plan.findings)),
    recipeRepeats: recipeRepeats(plan),
    feasibility: feasibility(plan, catalog, profile),
    categoryShares: categoryShares(plan, catalog),
    guidelines: evaluator.evaluate(plan, { blockingItemIds, pathologies, goal, goalCategory }),
  };
}

// Lo que se ve de la propuesta: comida → opciones → ítems por nombre.
function itemLabel(item) {
  if (item.type === 'food') return item.foodName;
  if (item.type === 'food_group') return `${item.foodGroupName} (grupo)`;
  if (item.type === 'recipe') return `Receta: ${item.recipe?.name}`;
  return `No reconocido: ${item.originalText}`;
}

function compactProposal(plan) {
  return plan.meals.map(({ mealType, options }) => ({
    mealType,
    options: options.map(({ items }) => items.map(itemLabel)),
  }));
}

// Las recetas de la propuesta frente a las candidatas que recibió la IA, tal como
// se guardaron en la traza. ownNames son los nombres de las recetas propias de la
// cuenta: la propuesta no lo informa.
function auditRecipes(plan, contextSent, { ownNames = new Set(), controlNames = CONTROL_RECIPE_NAMES } = {}) {
  const candidates = new Map((contextSent?.candidate_recipes ?? []).map((recipe) => [recipe.name, recipe]));
  const proposed = plan.meals.flatMap(({ mealType, options }) =>
    options.flatMap(({ items }) =>
      items
        .filter(({ type }) => type === 'recipe')
        .map(({ recipe: { name } }) => ({
          mealType,
          name,
          own: ownNames.has(name),
          control: controlNames.includes(name),
          offered: candidates.has(name),
          mealMatches: candidates.get(name)?.meal_types.includes(mealType) ?? false,
        })),
    ),
  );
  return { candidates: candidates.size, proposed };
}

// Como en los README de docs/: miles separados por espacio y coma decimal.
const formatMs = (ms) => (ms == null ? '—' : String(ms).replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
const formatRate = (value) => (value == null ? '—' : `${String(Math.round(value * 1000) / 10).replace('.', ',')} %`);
const formatCost = (value) => (value == null ? '—' : `US$ ${value.toFixed(4).replace('.', ',')}`);
// "(IC 86–98 %)": el intervalo de Wilson, en porcentaje entero.
const formatInterval = (interval) =>
  interval ? `(IC ${Math.round(interval.low * 100)}–${Math.round(interval.high * 100)} %)` : '';
const formatGoal = (value) => (value == null ? '—' : value ? 'Cumple' : 'No cumple');

function markdownReport({ summary }) {
  const overall = summary.overall;
  const lines = [
    '| Caso | Intentos | Válidas | Sin bloqueantes | Total P50 (ms) | Total P95 (ms) | Total máx. (ms) | Proveedor P95 (ms) | Overhead P95 (ms) | Tokens entrada (media) | Tokens salida (media) | De razonamiento (media) | Costo |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  const row = (label, s) =>
    `| ${label} | ${s.attempts} | ${s.valid} | ${s.noBlocking} | ${formatMs(s.totalMs.p50)} | ${formatMs(s.totalMs.p95)} | ` +
    `${formatMs(s.totalMs.max)} | ${formatMs(s.providerMs.p95)} | ${formatMs(s.overheadMs.p95)} | ` +
    `${formatMs(s.inputTokens.mean)} | ${formatMs(s.outputTokens.mean)} | ${formatMs(s.reasoningTokens.mean)} | ` +
    `${formatCost(s.cost.total)} |`;
  for (const [code, s] of Object.entries(summary.byCase)) lines.push(row(code, s));
  lines.push(row('**Global**', overall));
  lines.push(
    '',
    '| Meta (Tabla 7 del IA2) | Valor | Resultado |',
    '|---|---|---|',
    `| Tiempo total P95 ≤ 15 s | ${formatMs(overall.totalMs.p95)} ms | ${formatGoal(overall.goals.p95UnderTimeGoal)} |`,
    `| Propuestas sin bloqueantes ≥ 95 % (sobre intentos) | ${formatRate(overall.noBlockingRateOfAttempts)} ${formatInterval(overall.noBlockingInterval)} | ${formatGoal(overall.goals.noBlockingAtLeastGoal)} |`,
    `| Salidas válidas | ${formatRate(overall.validRate)} | — |`,
  );
  if (Object.keys(overall.failures).length > 0) {
    lines.push('', `Fallas: ${Object.entries(overall.failures).map(([reason, count]) => `${reason} ${count}`).join(', ')}.`);
  }
  lines.push(
    '',
    '| Caso | Candidatas (media) | Recetas propuestas | Propias | De control | Fuera de las candidatas | En otra comida |',
    '|---|---|---|---|---|---|---|',
  );
  const recipeRow = (label, { recipes }) =>
    `| ${label} | ${formatMs(recipes.candidates.mean)} | ${recipes.proposed} | ${recipes.own} | ${recipes.control} | ` +
    `${recipes.notOffered} | ${recipes.wrongMeal} |`;
  for (const [code, s] of Object.entries(summary.byCase)) lines.push(recipeRow(code, s));
  lines.push(recipeRow('**Global**', overall));

  const byCase = [...Object.entries(summary.byCase), ['**Global**', overall]];
  lines.push('', compositionTable(byCase), '', findingsTable(byCase), '', guidelinesTable(Object.entries(summary.byCase)));
  if (summary.byPatientGoal) {
    const byGoal = Object.entries(summary.byPatientGoal);
    lines.push('', categoriesTable(byGoal), '', guidelinesTable(byGoal));
  }
  return lines.join('\n');
}

const formatShare = (num, den) => formatRate(ratio(num ?? 0, den ?? 0));
const MEAL_LABELS = { breakfast: 'Desayuno', lunch: 'Almuerzo', afternoon_snack: 'Merienda', dinner: 'Cena' };

// Tipo de opción, recetas repetidas y factibilidad (T58), por caso.
function compositionTable(columns) {
  const lines = [
    '| Caso | Propuestas | Opciones | De receta | Receta con otros ítems | Armadas | Armadas incompletas | Propuestas con recetas repetidas | Repetidas entre comidas | En la misma comida | Ítems de receta | Sin el equipamiento | Superan los minutos del paciente (dato) | Sin método de cocción |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const [label, { evaluation }] of columns) {
    const kinds = evaluation.optionKinds.total;
    const repeats = evaluation.recipeRepeats;
    const feasible = evaluation.feasibility;
    lines.push(
      `| ${label} | ${evaluation.proposals} | ${kinds.options ?? 0} | ${formatShare(kinds.recipe, kinds.options)} | ` +
        `${formatShare(kinds.recipeWithExtras, kinds.options)} | ${formatShare(kinds.assembled, kinds.options)} | ` +
        `${formatShare(kinds.assembledIncomplete, kinds.assembled)} | ` +
        `${repeats.proposalsWithRepeats} | ${repeats.betweenMeals} | ${repeats.withinMeal} | ` +
        `${feasible ? `${feasible.recipeItems} | ${feasible.equipment} | ${feasible.time} | ${feasible.unknown}` : '— | — | — | —'} |`,
    );
  }
  return lines.join('\n');
}

// Hallazgos del motor por tipo, como "bloqueantes / advertencias".
function findingsTable(columns) {
  const types = [...new Set(columns.flatMap(([, { findings }]) => Object.keys(findings)))].sort();
  if (types.length === 0) return 'Sin hallazgos.';
  const lines = [`| Caso | ${types.join(' | ')} |`, `|---|${types.map(() => '---|').join('')}`];
  for (const [label, { findings }] of columns) {
    const cells = types.map((type) => (findings[type] ? `${findings[type].blocking} / ${findings[type].warning}` : '—'));
    lines.push(`| ${label} | ${cells.join(' | ')} |`);
  }
  return `Hallazgos por tipo (bloqueantes / advertencias):\n\n${lines.join('\n')}`;
}

// Pautas de adecuación (T57) en filas y casos u objetivos en columnas. Una pauta
// de nivel plan da el % de propuestas que cumplen; una de opción, el % agrupado
// de opciones. "—" es que no se aplica al paciente o que no hubo nada que medir.
function guidelinesTable(columns) {
  const header = columns.map(([label]) => label);
  const lines = [`| Pauta | Nivel | ${header.join(' | ')} |`, `|---|---|${header.map(() => '---|').join('')}`];
  for (const id of GUIDELINE_IDS) {
    const entries = columns.map(([, { evaluation }]) => evaluation.guidelines[id]);
    const present = entries.find(Boolean);
    if (!present) continue;
    const level = present.level === 'plan' ? 'Plan' : 'Opción';
    if (present.sameAs) {
      lines.push(`| ${id} | ${level} | ${entries.map((entry) => (entry ? `= ${entry.sameAs.join(', ')}` : '—')).join(' | ')} |`);
      continue;
    }
    const cell = (value) => (value ? formatShare(value.num, value.den) : '—');
    if (entries.some((entry) => entry?.main)) lines.push(`| ${id} | ${level} | ${entries.map((entry) => cell(entry?.main)).join(' | ')} |`);
    const names = [...new Set(entries.flatMap((entry) => Object.keys(entry?.indicators ?? {})))];
    for (const name of names) {
      lines.push(`| ${id} · ${name} | ${level} | ${entries.map((entry) => cell(entry?.indicators?.[name])).join(' | ')} |`);
    }
  }
  return lines.join('\n');
}

// Las proporciones que se comparan entre corridas, como { label, value: { num,
// den } }: las de calidad de la propuesta y cada indicador de las pautas. Un
// contador que la corrida anterior no registraba queda undefined y se muestra "—".
function comparableRates(summary) {
  const { evaluation } = summary;
  const kinds = evaluation.optionKinds.total;
  const feasible = evaluation.feasibility ?? {};
  const rate = (num, den) => (num == null || den == null ? null : { num, den });
  const rows = [
    { label: 'Sin bloqueantes (sobre intentos)', value: rate(summary.noBlocking, summary.attempts) },
    { label: 'Válidas', value: rate(summary.valid, summary.attempts) },
    { label: 'Sin ningún hallazgo', value: rate(summary.noFindings, summary.valid) },
    { label: 'Opciones con receta', value: rate(kinds.recipe, kinds.options) },
    { label: 'Armadas incompletas', value: rate(kinds.assembledIncomplete, kinds.assembled) },
    { label: 'Propuestas con recetas repetidas', value: rate(evaluation.recipeRepeats.proposalsWithRepeats, evaluation.proposals) },
    { label: 'Recetas sin el equipamiento', value: rate(feasible.equipment, feasible.recipeItems) },
    { label: 'Recetas que superan los minutos del paciente (dato)', value: rate(feasible.time, feasible.recipeItems) },
  ];
  for (const id of GUIDELINE_IDS) {
    const guideline = evaluation.guidelines[id];
    if (!guideline || guideline.sameAs) continue;
    if (guideline.main) rows.push({ label: id, value: guideline.main });
    for (const [name, value] of Object.entries(guideline.indicators ?? {})) rows.push({ label: `${id} · ${name}`, value });
  }
  return rows;
}

// Supera el ruido si los intervalos de Wilson de las dos corridas no se solapan.
// Es un criterio conservador: una diferencia real chica puede no superarlo.
function beyondNoise(previous, current) {
  const a = wilson(previous.num, previous.den);
  const b = wilson(current.num, current.den);
  return Boolean(a && b) && (a.high < b.low || b.high < a.low);
}

const formatPoints = (difference) =>
  `${difference > 0 ? '+' : ''}${String(Math.round(difference * 1000) / 10).replace('.', ',')} pp`;

// Comparación con la corrida anterior (T58: cada cambio se mide solo, contra la
// anterior). Se recalculan los dos resúmenes sobre los casos que tienen en común,
// para que un caso nuevo no mueva el global. El tiempo se informa, pero no se
// usa para juzgar el cambio: depende de la franja horaria del proveedor.
function compareRuns(previousRun, currentRun) {
  const codes = new Set(previousRun.generations.map(({ caseCode }) => caseCode));
  const common = currentRun.generations.filter(({ caseCode }) => codes.has(caseCode));
  const commonCodes = new Set(common.map(({ caseCode }) => caseCode));
  if (commonCodes.size === 0) return 'Comparación: la corrida anterior no tiene ningún caso en común con esta.';
  const previous = summarizeRun(previousRun.generations.filter(({ caseCode }) => commonCodes.has(caseCode)));
  const current = summarizeRun(common);

  const cell = (value) => (value && value.den > 0 ? formatShare(value.num, value.den) : '—');
  const rowsOf = (summary) => new Map(comparableRates(summary).map(({ label, value }) => [label, value]));
  const compareRow = (label, before, after) => {
    const comparable = before?.den > 0 && after?.den > 0;
    const difference = comparable ? formatPoints(after.num / after.den - before.num / before.den) : '—';
    const noise = comparable ? (beyondNoise(before, after) ? 'Sí' : 'No') : '—';
    return `| ${label} | ${cell(before)} | ${cell(after)} | ${difference} | ${noise} |`;
  };

  const before = rowsOf(previous.overall);
  const after = rowsOf(current.overall);
  const labels = [...new Set([...before.keys(), ...after.keys()])];
  const lines = [
    `Comparación con ${previousRun.meta?.label ?? previousRun.meta?.startedAt ?? 'la corrida anterior'}, sobre los casos en común (${[...commonCodes].join(', ')}):`,
    '',
    '| Indicador | Anterior | Actual | Diferencia | Supera el ruido |',
    '|---|---|---|---|---|',
    ...labels.map((label) => compareRow(label, before.get(label), after.get(label))),
    '',
    '| Informativo | Anterior | Actual |',
    '|---|---|---|',
    `| Tokens de entrada (media) | ${formatMs(previous.overall.inputTokens.mean)} | ${formatMs(current.overall.inputTokens.mean)} |`,
    `| Costo por intento | ${formatCost(previous.overall.cost.perAttempt)} | ${formatCost(current.overall.cost.perAttempt)} |`,
    `| Total P95 (ms), depende del horario | ${formatMs(previous.overall.totalMs.p95)} | ${formatMs(current.overall.totalMs.p95)} |`,
  ];

  const changes = [];
  for (const code of commonCodes) {
    const caseBefore = rowsOf(previous.byCase[code]);
    for (const [label, value] of rowsOf(current.byCase[code])) {
      const old = caseBefore.get(label);
      if (old?.den > 0 && value?.den > 0 && beyondNoise(old, value)) {
        changes.push(`- ${code} · ${label}: ${cell(old)} → ${cell(value)}`);
      }
    }
  }
  lines.push('', 'Cambios por caso que superan el ruido:', '', ...(changes.length > 0 ? changes : ['- Ninguno.']));
  return lines.join('\n');
}

// Experimento de objetivo: % de opciones de cada comida que aportan cada categoría.
function categoriesTable(columns) {
  const lines = [
    `| Objetivo | Comida | Opciones | ${COMPARED_CATEGORIES.join(' | ')} |`,
    `|---|---|---|${COMPARED_CATEGORIES.map(() => '---|').join('')}`,
  ];
  for (const [label, { evaluation }] of columns) {
    for (const meal of MEAL_TYPES) {
      const shares = evaluation.categoryShares[meal];
      if (!shares) continue;
      const cells = COMPARED_CATEGORIES.map((category) => formatShare(shares.categories?.[category], shares.options));
      lines.push(`| ${label} | ${MEAL_LABELS[meal]} | ${shares.options} | ${cells.join(' | ')} |`);
    }
  }
  return lines.join('\n');
}

function readRun(file, dir) {
  const resolved = fs.existsSync(file) || !dir ? file : path.join(dir, file);
  if (!fs.existsSync(resolved)) throw new Error(`--compare: no existe ${file}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function localDate(date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TIME_ZONE, dateStyle: 'short' }).format(date);
}

function localTime(date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' })
    .format(date)
    .replace(':', '');
}

function outputFile(dir, date, provider, model, label) {
  const base = [localDate(date), provider ?? 'sin-traza', model ?? 'sin-traza', label].filter(Boolean).join('-');
  const plain = path.join(dir, `${base}.json`);
  return fs.existsSync(plain) ? path.join(dir, `${base}-${localTime(date)}.json`) : plain;
}

async function request(apiUrl, method, route, { token, body } = {}) {
  let response;
  try {
    response = await fetch(`${apiUrl}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`No se pudo llegar a ${apiUrl} (${error.cause?.code ?? error.message}). ¿Está levantado el stack (npm run up)?`);
  }
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

async function login(apiUrl, password) {
  const { status, json } = await request(apiUrl, 'POST', '/auth/login', {
    body: { email: CASES_ACCOUNT, password },
  });
  if (status !== 200) throw new Error(`Login de ${CASES_ACCOUNT} falló con ${status}: ${json?.error?.message}`);
  return json.token;
}

// patientGoal solo en el experimento de objetivo: el objetivo con el que se
// generó, que main ya dejó cargado en el paciente.
async function generateOnce(apiUrl, token, prisma, ownNames, clinicalCase, iteration, patientGoal = null) {
  const { code, patientId } = clinicalCase;
  const startedAt = new Date();
  const t0 = performance.now();
  const { status, json } = await request(apiUrl, 'POST', `/patients/${patientId}/plans/generate`, { token, body: {} });
  const totalMs = Math.round(performance.now() - t0);

  const row = { caseCode: code, iteration, ...(patientGoal != null ? { patientGoal } : {}), status, totalMs };
  let trace = null;
  if (status === 201) {
    trace = await prisma.aiGeneration.findFirst({ where: { planId: json.id } });
    const findings = json.findings ?? [];
    Object.assign(row, {
      planId: json.id,
      options: json.meals.reduce((total, { options }) => total + options.length, 0),
      textChars: aiTextChars(json),
      validationResult: json.generation?.validationResult ?? null,
      blocking: findings.filter(({ severity }) => severity === 'blocking').length,
      warnings: findings.filter(({ severity }) => severity === 'warning').length,
    });
  } else {
    row.reason = json?.error?.details?.reason ?? null;
    // Solo las fallas que llegaron al proveedor tienen traza (DA-31).
    trace = await prisma.aiGeneration.findFirst({
      where: { patientId, planId: null, generatedAt: { gte: startedAt } },
      orderBy: { generatedAt: 'desc' },
    });
  }

  if (trace) {
    Object.assign(row, {
      provider: trace.provider,
      model: trace.model,
      templateVersion: trace.templateVersion,
      providerMs: trace.durationMs,
      overheadMs: status === 201 ? totalMs - trace.durationMs : null,
      inputTokens: trace.inputTokens,
      outputTokens: trace.outputTokens,
      reasoningTokens: trace.reasoningTokens,
      cost: estimateCost(trace.model, trace.inputTokens, trace.outputTokens),
    });
  }
  if (status === 201) {
    row.findings = json.findings.map(({ severity, type, message }) => ({ severity, type, message }));
    row.proposal = compactProposal(json);
    row.recipeAudit = auditRecipes(json, trace?.contextSent, { ownNames });
    // Un error al evaluar no tira la corrida, que ya pagó la generación: queda
    // anotado y la propuesta no suma a la validez.
    try {
      const goal = patientGoal ?? clinicalCase.goal;
      const goalCategory = patientGoal != null ? goalCategoryFor(patientGoal) : clinicalCase.goalCategory;
      row.evaluation = evaluateProposal(json, clinicalCase.evaluationInputs, { goal, goalCategory });
    } catch (error) {
      row.evaluationError = error.message;
    }
  }
  return row;
}

function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      n: { type: 'string', default: String(DEFAULT_ITERATIONS) },
      cases: { type: 'string' },
      out: { type: 'string' },
      note: { type: 'string' },
      label: { type: 'string' },
      goal: { type: 'string', multiple: true },
      compare: { type: 'string' },
    },
  });
  const iterations = Number(values.n);
  if (!Number.isInteger(iterations) || iterations < 1) throw new Error('--n tiene que ser un entero mayor que 0');
  const codes = values.cases ? values.cases.split(',').map((code) => code.trim()) : null;
  const unknown = (codes ?? []).filter((code) => !CLINICAL_CASES.some((clinicalCase) => clinicalCase.code === code));
  if (unknown.length > 0) throw new Error(`Casos desconocidos: ${unknown.join(', ')}`);
  if (values.label && !/^[a-z0-9-]+$/.test(values.label)) {
    throw new Error('--label solo admite minúsculas, números y guiones (va en el nombre del archivo)');
  }
  const goals = (values.goal ?? []).map((goal) => goal.trim());
  if (goals.length > 0) {
    if (codes?.length !== 1) throw new Error('--goal necesita un solo caso en --cases (el experimento cambia su objetivo)');
    if (goals.some((goal) => goal.length === 0 || goal.length > GOAL_MAX_LENGTH)) {
      throw new Error(`--goal no puede estar vacío ni pasar de ${GOAL_MAX_LENGTH} caracteres`);
    }
    if (new Set(goals).size !== goals.length) throw new Error('--goal repetido');
  }
  return { iterations, codes, out: values.out, note: values.note, label: values.label, goals, compare: values.compare };
}

async function main() {
  const { iterations, codes, out, note, label, goals, compare } = parseOptions(process.argv.slice(2));
  // La corrida anterior se lee antes de gastar en el proveedor: un nombre mal
  // escrito corta acá. Un nombre suelto se busca en la carpeta de --out.
  const previousRun = compare ? readRun(compare, out) : null;
  const apiUrl = process.env.MEASURE_API_URL || DEFAULT_API_URL;
  // Se importan acá para que los tests de las funciones puras no los carguen.
  const { SEED_PASSWORD } = require('./seed');
  const prisma = require('../src/lib/prisma');
  const planValidationService = require('../src/services/planValidation.service');
  let restoreGoal = null;

  try {
    if (!SEED_PASSWORD) throw new Error('Falta SEED_PASSWORD (la contraseña de las cuentas del seed).');
    const token = await login(apiUrl, SEED_PASSWORD);
    const { json: patients } = await request(apiUrl, 'GET', '/patients', { token });
    const cases = matchCases(
      CLINICAL_CASES.filter(({ code }) => !codes || codes.includes(code)),
      patients,
    );
    const { json: recipes } = await request(apiUrl, 'GET', '/recipes', { token });
    const ownNames = new Set(recipes.filter(({ own }) => own).map(({ name }) => name));

    // Lo que necesita la evaluación de cada caso (T58), leído una sola vez: el
    // catálogo del motor, las patologías y el objetivo del paciente, y su perfil
    // de factibilidad (equipamiento y minutos por día, T62). Un nombre de las
    // pautas que no esté en el catálogo corta acá, antes de gastar en el proveedor.
    const nutritionist = await prisma.nutritionist.findUnique({ where: { email: CASES_ACCOUNT }, select: { id: true } });
    for (const clinicalCase of cases) {
      const inputs = await planValidationService.loadInputs(clinicalCase.patientId, nutritionist.id);
      const catalog = indexCatalog(inputs.catalog);
      const patient = await prisma.patient.findUnique({
        where: { id: clinicalCase.patientId },
        select: { goal: true, goalCategory: true, cooks: true, hasOven: true, hasStovetop: true, hasMicrowave: true, cookingMinutesPerDay: true },
      });
      clinicalCase.goal = patient.goal;
      clinicalCase.goalCategory = patient.goalCategory;
      clinicalCase.evaluationInputs = {
        catalog,
        evaluator: createGuidelineEvaluator(catalog),
        pathologies: inputs.conditions.map(({ pathology }) => pathology?.name).filter(Boolean),
        // Desde T62, el perfil sale de los datos estructurados del paciente.
        profile: feasibilityProfile(patient),
      };
    }

    const startedAt = new Date();
    const generations = [];
    const log = (row) =>
      console.log(
        `${row.caseCode}${row.patientGoal ? ` (${row.patientGoal})` : ''} #${row.iteration}: ` +
          `${row.status}${row.reason ? ` ${row.reason}` : ''}, ` +
          `${formatMs(row.totalMs)} ms (proveedor ${formatMs(row.providerMs)} ms)` +
          `${row.validationResult ? `, ${row.validationResult}` : ''}${row.evaluationError ? `, sin evaluar: ${row.evaluationError}` : ''}`,
      );

    if (goals.length > 0) {
      // Experimento de objetivo: el objetivo cambia antes de cada generación, en
      // round-robin, y el original vuelve aunque la corrida falle.
      const [clinicalCase] = cases;
      // Desde T61 cambia también la categoría, con el criterio de CM-08 para el texto.
      const setGoal = (goal, goalCategory = goalCategoryFor(goal)) =>
        prisma.patient.update({ where: { id: clinicalCase.patientId }, data: { goal, goalCategory } });
      restoreGoal = () => setGoal(clinicalCase.goal, clinicalCase.goalCategory);
      console.log(`Experimento de objetivo: ${clinicalCase.code} × ${goals.length} objetivos × ${iterations} contra ${apiUrl}`);
      for (let iteration = 1; iteration <= iterations; iteration += 1) {
        for (const goal of goals) {
          await setGoal(goal);
          const row = await generateOnce(apiUrl, token, prisma, ownNames, clinicalCase, iteration, goal);
          generations.push(row);
          log(row);
        }
      }
    } else {
      console.log(`Medición: ${cases.length} casos × ${iterations} generaciones contra ${apiUrl}`);
      // Round-robin: una vuelta por todos los casos antes de repetir, para que
      // una variación del proveedor en el tiempo no caiga sobre un solo caso.
      for (let iteration = 1; iteration <= iterations; iteration += 1) {
        for (const clinicalCase of cases) {
          const row = await generateOnce(apiUrl, token, prisma, ownNames, clinicalCase, iteration);
          generations.push(row);
          log(row);
        }
      }
    }

    const summary = summarizeRun(generations);
    if (summary.models.length > 1) console.warn(`Aviso: la corrida mezcla modelos (${summary.models.join(', ')}).`);
    const first = generations.find(({ model }) => model) ?? {};
    const unpriced = summary.models.filter((model) => !PRICES[model]);
    if (unpriced.length > 0) console.warn(`Aviso: sin precio para ${unpriced.join(', ')}; el costo queda vacío.`);

    const run = {
      meta: {
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        provider: first.provider ?? null,
        model: first.model ?? null,
        templateVersion: first.templateVersion ?? null,
        iterations,
        cases: cases.map(({ code, title, goal, evaluationInputs }) => ({
          code,
          title,
          goal,
          pathologies: evaluationInputs.pathologies,
          feasibility: evaluationInputs.profile,
        })),
        goalExperiment:
          goals.length > 0
            ? { case: cases[0].code, goals, originalGoal: cases[0].goal, originalGoalCategory: cases[0].goalCategory }
            : null,
        account: CASES_ACCOUNT,
        apiUrl,
        prices: Object.fromEntries(summary.models.map((model) => [model, PRICES[model] ?? null])),
        goals: { totalP95Ms: TIME_GOAL_MS, noBlockingRate: NO_BLOCKING_GOAL },
        note: note ?? null,
        label: label ?? null,
        comparedWith: compare ? path.basename(compare) : null,
      },
      summary,
      generations,
    };

    console.log(`\n${markdownReport(run)}`);
    if (previousRun) console.log(`\n${compareRuns(previousRun, run)}`);
    if (out) {
      const file = outputFile(out, startedAt, first.provider, first.model, label);
      fs.writeFileSync(file, `${JSON.stringify(run, null, 2)}\n`);
      console.log(`\nResultado: ${path.basename(file)}`);
    }
  } finally {
    if (restoreGoal) await restoreGoal();
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  PRICES,
  percentile,
  stats,
  estimateCost,
  matchCases,
  summarize,
  summarizeRun,
  compactProposal,
  auditRecipes,
  markdownReport,
  parseOptions,
  aiTextChars,
  evaluateProposal,
  wilson,
  compareRuns,
};
