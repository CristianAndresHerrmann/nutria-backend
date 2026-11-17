const {
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
} = require('./measure-generation');
const { PLAN_USAGE_TEXT } = require('../src/domain/generacion/planTexts');
const { CLINICAL_CASES } = require('./seed-data/clinical-cases');

const valid = (overrides = {}) => ({
  caseCode: 'C1',
  status: 201,
  totalMs: 1000,
  providerMs: 900,
  overheadMs: 100,
  inputTokens: 10000,
  outputTokens: 1000,
  reasoningTokens: 200,
  cost: 0.01,
  model: 'gpt-6-luna',
  validationResult: 'warnings',
  options: 12,
  textChars: 2000,
  ...overrides,
});

describe('measure-generation — medición de la generación (T41)', () => {
  it('calcula el percentil por rango más cercano, sin interpolar', () => {
    const values = Array.from({ length: 20 }, (_, index) => (index + 1) * 100);
    expect(percentile(values, 95)).toBe(1900);
    expect(percentile(values, 50)).toBe(1000);
    expect(percentile([3, 1, 2], 95)).toBe(3);
    expect(percentile([], 95)).toBeNull();
  });

  it('resume ignorando los valores ausentes', () => {
    expect(stats([100, null, 300])).toEqual({ n: 2, mean: 200, p50: 100, p95: 300, max: 300 });
    expect(stats([])).toEqual({ n: 0, mean: null, p50: null, p95: null, max: null });
  });

  it('estima el costo por millón de tokens, y lo deja vacío sin precio o sin tokens', () => {
    const prices = { m: { input: 1, output: 4 } };
    expect(estimateCost('m', 1_000_000, 500_000, prices)).toBe(3);
    expect(estimateCost('fake-deterministic', 5000, 500)).toBe(0);
    expect(estimateCost('otro', 1000, 1000, prices)).toBeNull();
    expect(estimateCost('m', null, null, prices)).toBeNull();
  });

  it('encuentra cada caso por nombre y apellido, y falla con los que faltan', () => {
    const [first, second] = CLINICAL_CASES;
    const patients = [{ id: 'p1', firstName: first.patient.data.firstName, lastName: first.patient.data.lastName }];
    expect(matchCases([first], patients)).toEqual([{ code: first.code, title: first.title, patientId: 'p1' }]);
    expect(() => matchCases([first, second], patients)).toThrow(new RegExp(`${second.code}.*npm run db:seed`));
  });

  it('mide los tiempos sobre las válidas, cuenta las fallas por reason y suma el costo de las fallas con traza', () => {
    const summary = summarize([
      valid({ totalMs: 1000 }),
      valid({ totalMs: 3000, validationResult: 'blocking' }),
      valid({ totalMs: 2000, validationResult: 'no_findings' }),
      { caseCode: 'C1', status: 503, reason: 'invalid_output', totalMs: 9000, inputTokens: 10000, outputTokens: 900, cost: 0.02 },
      { caseCode: 'C1', status: 503, reason: 'unreachable', totalMs: 5 },
    ]);

    expect(summary).toMatchObject({
      attempts: 5,
      valid: 3,
      validRate: 0.6,
      failures: { invalid_output: 1, unreachable: 1 },
      noBlocking: 2,
      noBlockingRateOfAttempts: 0.4,
      totalMs: { n: 3, p95: 3000, max: 3000 },
      inputTokens: { n: 4 },
      reasoningTokens: { n: 3, mean: 200 },
      options: { n: 3, mean: 12 },
      goals: { p95UnderTimeGoal: true, noBlockingAtLeastGoal: false },
    });
    expect(summary.noBlockingRateOfValid).toBeCloseTo(2 / 3);
    expect(summary.cost.total).toBeCloseTo(0.05);
  });

  it('no cumple la meta de tiempo con un P95 de más de 15 s', () => {
    const rows = Array.from({ length: 20 }, (_, index) => valid({ totalMs: index < 18 ? 9000 : 16000 }));
    expect(summarize(rows).goals.p95UnderTimeGoal).toBe(false);
  });

  it('resume por caso, y por modelo solo si la corrida mezcla modelos', () => {
    const single = summarizeRun([valid(), valid({ caseCode: 'C2' })]);
    expect(Object.keys(single.byCase)).toEqual(['C1', 'C2']);
    expect(single.byModel).toBeUndefined();

    const mixed = summarizeRun([valid(), valid({ model: 'gemini-3.8-flash' })]);
    expect(Object.keys(mixed.byModel)).toEqual(['gpt-6-luna', 'gemini-3.8-flash']);
  });

  it('arma la propuesta compacta con el nombre de cada ítem según su tipo', () => {
    const plan = {
      meals: [
        {
          mealType: 'breakfast',
          options: [
            {
              items: [
                { type: 'food', foodName: 'Manzana' },
                { type: 'food_group', foodGroupName: 'Frutas' },
                { type: 'recipe', recipe: { name: 'Tarta' } },
                { type: 'unrecognized', originalText: 'Agua' },
              ],
            },
          ],
        },
      ],
    };
    expect(compactProposal(plan)).toEqual([
      { mealType: 'breakfast', options: [['Manzana', 'Frutas (grupo)', 'Receta: Tarta', 'No reconocido: Agua']] },
    ]);
  });

  describe('auditoría de las recetas propuestas', () => {
    const recipeItem = (name) => ({ type: 'recipe', recipe: { name } });
    const plan = {
      meals: [
        { mealType: 'breakfast', options: [{ items: [recipeItem('Propia'), { type: 'food', foodName: 'Manzana' }] }] },
        { mealType: 'lunch', options: [{ items: [recipeItem('Común de desayuno')] }, { items: [recipeItem('De control')] }] },
        { mealType: 'dinner', options: [{ items: [recipeItem('Sin ofrecer')] }] },
      ],
    };
    const contextSent = {
      candidate_recipes: [
        { name: 'Propia', meal_types: ['breakfast'] },
        { name: 'Común de desayuno', meal_types: ['breakfast'] },
        { name: 'De control', meal_types: ['lunch'] },
      ],
    };
    const options = { ownNames: new Set(['Propia', 'De control']), controlNames: ['De control'] };

    it('clasifica cada receta frente a las candidatas de la traza', () => {
      expect(auditRecipes(plan, contextSent, options)).toEqual({
        candidates: 3,
        proposed: [
          { mealType: 'breakfast', name: 'Propia', own: true, control: false, offered: true, mealMatches: true },
          { mealType: 'lunch', name: 'Común de desayuno', own: false, control: false, offered: true, mealMatches: false },
          { mealType: 'lunch', name: 'De control', own: true, control: true, offered: true, mealMatches: true },
          { mealType: 'dinner', name: 'Sin ofrecer', own: false, control: false, offered: false, mealMatches: false },
        ],
      });
    });

    it('sin traza, ninguna receta cuenta como ofrecida', () => {
      const audit = auditRecipes(plan, undefined, options);
      expect(audit.candidates).toBe(0);
      expect(audit.proposed.every(({ offered }) => !offered)).toBe(true);
    });

    it('resume la auditoría y la imprime por caso', () => {
      const summary = summarizeRun([valid({ recipeAudit: auditRecipes(plan, contextSent, options) }), valid()]);
      expect(summary.overall.recipes).toEqual({
        candidates: { n: 1, mean: 3, p50: 3, p95: 3, max: 3 },
        proposed: 4,
        own: 2,
        control: 1,
        notOffered: 1,
        wrongMeal: 1,
      });
      expect(markdownReport({ summary })).toContain('| C1 | 3 | 4 | 2 | 1 | 1 | 1 |');
    });
  });

  it('imprime una fila por caso, la global y las metas', () => {
    const report = markdownReport({ summary: summarizeRun([valid(), valid({ caseCode: 'C2' })]) });
    expect(report).toMatch(/^\| C1 \|/m);
    expect(report).toMatch(/^\| C2 \|/m);
    expect(report).toMatch(/^\| \*\*Global\*\* \|/m);
    expect(report).toContain('Tiempo total P95 ≤ 15 s');
  });

  it('formatea como los README de docs/: miles con espacio y coma decimal', () => {
    const report = markdownReport({
      summary: summarizeRun([valid({ totalMs: 13636, cost: 0.0545, validationResult: 'blocking' }), valid()]),
    });
    expect(report).toContain('| 13 636 |');
    expect(report).toContain('US$ 0,0645');
    expect(report).toContain('| 50 % (IC ');
  });

  it('valida las opciones de la línea de comandos', () => {
    expect(parseOptions([])).toMatchObject({ iterations: 10, codes: null, goals: [] });
    expect(parseOptions(['--n', '3', '--cases', 'C1,C3'])).toMatchObject({ iterations: 3, codes: ['C1', 'C3'] });
    expect(() => parseOptions(['--n', '0'])).toThrow('--n');
    expect(() => parseOptions(['--cases', 'C9'])).toThrow('C9');
    expect(parseOptions(['--label', 'razonamiento-minimal']).label).toBe('razonamiento-minimal');
    expect(() => parseOptions(['--label', 'Con espacios'])).toThrow('--label');
  });

  it('acepta el experimento de objetivo solo con un caso y objetivos distintos (T58)', () => {
    const args = ['--cases', 'C6', '--goal', 'Bajar de peso', '--goal', ' Aumentar masa muscular '];
    expect(parseOptions(args).goals).toEqual(['Bajar de peso', 'Aumentar masa muscular']);
    expect(() => parseOptions(['--goal', 'Bajar de peso'])).toThrow('un solo caso');
    expect(() => parseOptions(['--cases', 'C1,C6', '--goal', 'Bajar de peso'])).toThrow('un solo caso');
    expect(() => parseOptions(['--cases', 'C6', '--goal', 'A', '--goal', 'A'])).toThrow('repetido');
    expect(() => parseOptions(['--cases', 'C6', '--goal', ' '])).toThrow('vacío');
    expect(() => parseOptions(['--cases', 'C6', '--goal', 'x'.repeat(256)])).toThrow('255');
  });

  describe('validez nutricional de la propuesta (T58)', () => {
    const { indexCatalog } = require('../src/domain/reglas/catalogIndex');
    const { createGuidelineEvaluator } = require('./adequacy-guidelines');
    const { FOOD_GROUPS, FOODS } = require('./seed-data/catalogs');

    const catalog = indexCatalog({
      foods: FOODS.map(({ name, group, categories }) => ({
        id: name,
        name,
        foodGroupId: group,
        active: true,
        categories: categories.map((category) => ({ category })),
      })),
      groups: FOOD_GROUPS.map(({ name, parent }) => ({ id: name, name, parentId: parent ?? null })),
      recipes: [
        {
          id: 'Pollo al horno',
          name: 'Pollo al horno',
          cookingMethod: 'oven',
          timeMinutes: 50,
          ingredients: [{ food: { id: 'Pechuga de pollo' } }, { food: { id: 'Papa' } }],
        },
      ],
    });
    const inputs = {
      catalog,
      evaluator: createGuidelineEvaluator(catalog),
      pathologies: [],
      profile: { cookingMethods: ['stovetop'], maxMinutes: 20 },
    };
    const food = (name) => ({
      id: `item ${name}`,
      type: 'food',
      foodId: name,
      foodCategories: catalog.food(name).categories.map(({ category }) => category),
    });
    const proposal = {
      meals: [
        {
          mealType: 'lunch',
          options: [
            {
              id: 'o-receta',
              items: [{ id: 'item receta', type: 'recipe', recipeId: 'Pollo al horno', recipe: { name: 'Pollo al horno' } }, food('Lechuga')],
            },
            { id: 'o-armada', items: [food('Pan francés'), food('Lechuga')] },
          ],
        },
      ],
      findings: [
        { severity: 'blocking', type: 'pathology_rule', optionItemId: 'item Pan francés' },
        { severity: 'warning', type: 'composition', optionId: 'o-armada' },
      ],
    };

    it('evalúa la propuesta: tipo de opción, factibilidad, categorías y pautas sin los ítems bloqueados', () => {
      const evaluation = evaluateProposal(proposal, inputs, { goal: 'Bajar de peso' });
      expect(evaluation.optionKinds.lunch).toEqual({
        options: 2,
        recipe: 1,
        recipeWithExtras: 1,
        recipeIncomplete: 0,
        assembled: 1,
        assembledIncomplete: 1,
      });
      expect(evaluation.feasibility).toMatchObject({ recipeItems: 1, equipment: 1, time: 1, infeasible: 1 });
      expect(evaluation.categoryShares.lunch.options).toBe(2);
      expect(evaluation.guidelines['PA-GEN-03'].main).toEqual({ num: 2, den: 2 });
      // El pan está bloqueado: la segunda opción no tiene cereal (CM-03).
      expect(evaluation.guidelines['PA-GEN-10'].main).toEqual({ num: 0, den: 0 });
      expect(evaluation.guidelines['PA-OBE-04']).toBeDefined();
    });

    it('resume la validez por caso y por objetivo, e imprime sus tablas', () => {
      const withGoal = (patientGoal) =>
        valid({
          caseCode: 'C6',
          patientGoal,
          findings: [{ severity: 'warning', type: 'meal_composition' }],
          evaluation: evaluateProposal(proposal, inputs, { goal: patientGoal }),
        });
      const summary = summarizeRun([withGoal('Bajar de peso'), withGoal('Bajar de peso'), withGoal('Comer más ordenado')]);

      expect(summary.overall.findings).toEqual({ meal_composition: { blocking: 0, warning: 3 } });
      expect(summary.overall.evaluation).toMatchObject({
        proposals: 3,
        optionKinds: { total: { options: 6, recipe: 3, recipeWithExtras: 3, assembled: 3, assembledIncomplete: 3 } },
        recipeRepeats: { proposalsWithRepeats: 0, repeated: 0 },
        feasibility: { recipeItems: 3, equipment: 3, time: 3, infeasible: 3 },
        categoryShares: { lunch: { options: 6 } },
      });
      const gen03 = summary.overall.evaluation.guidelines['PA-GEN-03'].main;
      expect(gen03).toMatchObject({ num: 6, den: 6 });
      expect(gen03.interval.high).toBeCloseTo(1);
      expect(Object.keys(summary.byPatientGoal)).toEqual(['Bajar de peso', 'Comer más ordenado']);
      expect(summary.byPatientGoal['Bajar de peso'].evaluation.guidelines['PA-OBE-04'].plans).toBe(2);
      expect(summary.byPatientGoal['Comer más ordenado'].evaluation.guidelines['PA-OBE-04']).toBeUndefined();

      const report = markdownReport({ summary });
      expect(report).toContain('| C6 | 3 | 6 | 50 % | 50 % | 50 % | 100 % | 0 | 0 | 0 | 3 | 3 | 3 | 0 |');
      expect(report).toContain('| C6 | 0 / 3 |');
      expect(report).toMatch(/^\| PA-GEN-03 \| Opción \| 100 % \|$/m);
      expect(report).toMatch(/^\| PA-OBE-04 \| Opción \| 50 % \| — \|$/m);
      expect(report).toMatch(/^\| Bajar de peso \| Almuerzo \| 4 \|/m);
    });

    it('sin evaluaciones, las tablas de validez quedan vacías sin romper el reporte', () => {
      expect(summarizeRun([valid()]).overall.evaluation).toMatchObject({ proposals: 0, feasibility: null, guidelines: {} });
      expect(markdownReport({ summary: summarizeRun([valid()]) })).toContain('Sin hallazgos.');
    });
  });

  describe('comparación entre corridas (T58: cada cambio contra la anterior)', () => {
    it('calcula el intervalo de Wilson al 95 %', () => {
      expect(wilson(10, 10).high).toBeCloseTo(1);
      expect(wilson(10, 10).low).toBeCloseTo(0.7225, 3);
      const { low, high } = wilson(66, 70);
      expect(low).toBeLessThan(66 / 70);
      expect(high).toBeGreaterThan(66 / 70);
      expect(wilson(0, 0)).toBeNull();
    });

    it('informa el intervalo de la meta de bloqueantes', () => {
      const report = markdownReport({ summary: summarizeRun([valid(), valid({ validationResult: 'blocking' })]) });
      expect(report).toMatch(/| 50 % (IC d+–d+ %) | No cumple |/);
    });

    it('compara sobre los casos en común y marca solo lo que supera el ruido', () => {
      const run = (rows) => ({ meta: { label: 'anterior' }, generations: rows });
      const previous = run(Array.from({ length: 10 }, () => valid({ validationResult: 'blocking' })));
      const current = run([
        ...Array.from({ length: 10 }, () => valid()),
        ...Array.from({ length: 10 }, () => valid({ caseCode: 'C8', validationResult: 'blocking' })),
      ]);

      const report = compareRuns(previous, current);
      expect(report).toContain('casos en común (C1)');
      expect(report).toContain('| Sin bloqueantes (sobre intentos) | 0 % | 100 % | +100 pp | Sí |');
      expect(report).toContain('| Válidas | 100 % | 100 % | 0 pp | No |');
      expect(report).toContain('| Armadas incompletas | — | — | — | — |');
      expect(report).toContain('- C1 · Sin bloqueantes (sobre intentos): 0 % → 100 %');
      expect(report).toContain('Total P95 (ms), depende del horario');
    });

    it('acepta la corrida anterior por la línea de comandos', () => {
      expect(parseOptions(['--compare', 'anterior.json']).compare).toBe('anterior.json');
    });
  });

  it('cuenta solo el texto de la IA: sin el texto fijo de uso ni las recomendaciones clínicas (DA-43)', () => {
    const plan = {
      introduction: 'abcde',
      generalRecommendations: `${PLAN_USAGE_TEXT}\n\nfghij`,
      clinicalRecommendations: 'No es de la IA.',
    };

    expect(aiTextChars(plan)).toBe(10);
  });
});
