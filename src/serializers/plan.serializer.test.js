const { serializePlan } = require('./plan.serializer');

describe('plan.serializer', () => {
  it('no expone el nutricionista y deja el resumen de la última generación en generation', () => {
    const generation = { provider: 'fake', model: 'fake-1', templateVersion: 'v1', validationResult: 'warnings' };

    const result = serializePlan({ id: 'plan-1', nutritionistId: 'nutri-1', meals: [], findings: [], aiGenerations: [generation] });

    expect(result).toEqual({ id: 'plan-1', meals: [], findings: [], generation });
  });

  it('un plan sin generación tiene generation null', () => {
    expect(serializePlan({ id: 'plan-1', nutritionistId: 'nutri-1', aiGenerations: [] }).generation).toBeNull();
  });
});

describe('plan.serializer — orden de los hallazgos', () => {
  // Las comidas llegan fuera del orden del enum a propósito: manda el enum.
  const PLAN = {
    id: 'plan-1',
    meals: [
      {
        mealType: 'afternoon_snack',
        options: [{ id: 'm1', order: 1, items: [{ id: 'm1-i1', order: 1 }] }],
      },
      {
        mealType: 'breakfast',
        options: [
          { id: 'd2', order: 2, items: [{ id: 'd2-i1', order: 1 }] },
          { id: 'd1', order: 1, items: [{ id: 'd1-i1', order: 1 }, { id: 'd1-i2', order: 2 }] },
        ],
      },
    ],
  };

  const finding = (id, type, target, message = id) =>
    type === 'composition'
      ? { id, type, optionId: target, optionItemId: null, message }
      : { id, type, optionId: null, optionItemId: target, message };

  it('ordena por comida, opción e ítem, con la composición al final de su opción', () => {
    const findings = [
      finding('merienda-composicion', 'composition', 'm1'),
      finding('desayuno-2-composicion', 'composition', 'd2'),
      finding('desayuno-1-item-2-condicion', 'direct_condition', 'd1-i2'),
      finding('desayuno-1-composicion', 'composition', 'd1'),
      finding('merienda-item', 'unrecognized_item', 'm1-i1'),
      finding('desayuno-1-item-1-condicion', 'direct_condition', 'd1-i1'),
      finding('desayuno-1-item-1-no-reconocido', 'unrecognized_item', 'd1-i1'),
      finding('desayuno-2-item', 'direct_condition', 'd2-i1'),
    ];

    const { findings: sorted } = serializePlan({ ...PLAN, findings });

    expect(sorted.map(({ id }) => id)).toEqual([
      'desayuno-1-item-1-no-reconocido',
      'desayuno-1-item-1-condicion',
      'desayuno-1-item-2-condicion',
      'desayuno-1-composicion',
      'desayuno-2-item',
      'desayuno-2-composicion',
      'merienda-item',
      'merienda-composicion',
    ]);
  });

  it('dos hallazgos del mismo ítem y tipo se ordenan por mensaje, y uno que no se ubica va al final', () => {
    const findings = [
      finding('huerfano', 'direct_condition', 'no-existe'),
      finding('b', 'direct_condition', 'd1-i1', 'Leche: intolerancia'),
      finding('a', 'direct_condition', 'd1-i1', 'Leche: alergia'),
    ];

    const { findings: sorted } = serializePlan({ ...PLAN, findings });

    expect(sorted.map(({ id }) => id)).toEqual(['a', 'b', 'huerfano']);
  });
});
