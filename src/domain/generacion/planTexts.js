// Textos del plan generado que no redacta la IA (DA-43). Son determinísticos:
// aparecen en todo plan generado, y el profesional los puede editar (RF-40).

// Cómo usar las opciones y armar el plato. El método del plato sale de la GPC
// DM2 2019, p. 248 ("dividir el plato del almuerzo y cena a la mitad", una mitad
// con vegetales y dos cuartos con proteínas y con HC complejos): origen S. Que
// las opciones sean alternativas sale de la estructura del plan: origen P. No
// nombra alimentos, para no contradecir una condición del paciente (una alergia
// al huevo, por ejemplo).
const PLAN_USAGE_TEXT =
  'Cada comida tiene varias opciones: son alternativas, elegí una sola por comida. ' +
  'No son para comer todas juntas (por ejemplo, tres platos o tres tazas). ' +
  'En el almuerzo y la cena, armá el plato así: la mitad con verduras, un cuarto con el alimento ' +
  'con proteínas y un cuarto con el de hidratos de carbono complejos.';

// Las recomendaciones generales del plan: el texto de uso y, después, las de la IA.
function withUsageText(generalRecommendations) {
  const fromIa = generalRecommendations?.trim();
  return fromIa ? `${PLAN_USAGE_TEXT}\n\n${fromIa}` : PLAN_USAGE_TEXT;
}

// Las recomendaciones clínicas del catálogo para las patologías del paciente,
// copiadas como texto: editar la recomendación después no cambia un plan ya
// emitido (T22). Cada una con su título. null si no hay ninguna.
//
// Entran enteras mientras quepan en maxLength, el tope de los textos del plan:
// un borrador generado se tiene que poder volver a guardar tal cual. Las que no
// entran no se cortan a la mitad, y el texto avisa cuántas quedaron afuera.
const SEPARATOR = '\n\n';
const omittedNotice = (count) =>
  `${count === 1 ? 'Hay 1 recomendación' : `Hay ${count} recomendaciones`} más de estas patologías en el catálogo que no entraron en el plan.`;

function clinicalRecommendationsText(recommendations, maxLength = Infinity) {
  if (recommendations.length === 0) return null;

  const blocks = recommendations.map(({ title, text }) => `${title}\n${text}`);
  const included = [];
  for (const [index, block] of blocks.entries()) {
    const remaining = blocks.length - index - 1;
    const candidate = [...included, block];
    const reserve = remaining > 0 ? SEPARATOR.length + omittedNotice(remaining).length : 0;
    if (candidate.join(SEPARATOR).length + reserve > maxLength) break;
    included.push(block);
  }

  const omitted = blocks.length - included.length;
  if (omitted === 0) return included.join(SEPARATOR);
  return [...included, omittedNotice(omitted)].join(SEPARATOR);
}

module.exports = { PLAN_USAGE_TEXT, withUsageText, clinicalRecommendationsText };
