const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { CLINICAL_CASES } = require('./seed-data/clinical-cases');
const { CONTROL_RECIPE_NAMES } = require('./seed-data/private-recipes');
const { PLAN_USAGE_TEXT } = require('../src/domain/generacion/planTexts');

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
// Escribe el resultado en JSON (repo raíz, docs/mediciones-de-generacion/) e
// imprime el resumen en Markdown.

const CASES_ACCOUNT = 'nutricionista@nutria.com';
const DEFAULT_API_URL = 'http://backend:3000';
const DEFAULT_ITERATIONS = 5;
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
  return summary;
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
    `| Propuestas sin bloqueantes ≥ 95 % (sobre intentos) | ${formatRate(overall.noBlockingRateOfAttempts)} | ${formatGoal(overall.goals.noBlockingAtLeastGoal)} |`,
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
  return lines.join('\n');
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

async function generateOnce(apiUrl, token, prisma, ownNames, { code, patientId }, iteration) {
  const startedAt = new Date();
  const t0 = performance.now();
  const { status, json } = await request(apiUrl, 'POST', `/patients/${patientId}/plans/generate`, { token, body: {} });
  const totalMs = Math.round(performance.now() - t0);

  const row = { caseCode: code, iteration, status, totalMs };
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
  return { iterations, codes, out: values.out, note: values.note, label: values.label };
}

async function main() {
  const { iterations, codes, out, note, label } = parseOptions(process.argv.slice(2));
  const apiUrl = process.env.MEASURE_API_URL || DEFAULT_API_URL;
  // Se importan acá para que los tests de las funciones puras no los carguen.
  const { SEED_PASSWORD } = require('./seed');
  const prisma = require('../src/lib/prisma');

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

    const startedAt = new Date();
    console.log(`Medición: ${cases.length} casos × ${iterations} generaciones contra ${apiUrl}`);
    const generations = [];
    // Round-robin: una vuelta por todos los casos antes de repetir, para que
    // una variación del proveedor en el tiempo no caiga sobre un solo caso.
    for (let iteration = 1; iteration <= iterations; iteration += 1) {
      for (const clinicalCase of cases) {
        const row = await generateOnce(apiUrl, token, prisma, ownNames, clinicalCase, iteration);
        generations.push(row);
        console.log(
          `${row.caseCode} #${iteration}: ${row.status}${row.reason ? ` ${row.reason}` : ''}, ` +
            `${formatMs(row.totalMs)} ms (proveedor ${formatMs(row.providerMs)} ms)` +
            `${row.validationResult ? `, ${row.validationResult}` : ''}`,
        );
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
        cases: cases.map(({ code, title }) => ({ code, title })),
        account: CASES_ACCOUNT,
        apiUrl,
        prices: Object.fromEntries(summary.models.map((model) => [model, PRICES[model] ?? null])),
        goals: { totalP95Ms: TIME_GOAL_MS, noBlockingRate: NO_BLOCKING_GOAL },
        note: note ?? null,
        label: label ?? null,
      },
      summary,
      generations,
    };

    console.log(`\n${markdownReport(run)}`);
    if (out) {
      const file = outputFile(out, startedAt, first.provider, first.model, label);
      fs.writeFileSync(file, `${JSON.stringify(run, null, 2)}\n`);
      console.log(`\nResultado: ${path.basename(file)}`);
    }
  } finally {
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
};
