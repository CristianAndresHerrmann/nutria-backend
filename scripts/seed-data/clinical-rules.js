// Reglas clínicas por patología (T35; RF-43, RF-47): patología → alimento o grupo,
// con severidad y fuente bibliográfica. Cada fila tiene su ficha en
// docs/reglas-clinicas.md (R-05) del repo raíz, que es donde vive su origen. Lo que
// no está en esa matriz no se carga acá.
//
// Origen de toda la matriz: S (supuesto con fuente bibliográfica), DA-36. La
// entrevista de validación no se hizo; las reglas salen de las guías del corpus
// datos-rag/ y quedan pendientes de revisión con una nutricionista.
//
// - Severidad según la redacción de la fuente (DA-36): "exclusión", "descartar" o
//   "no usar" es prohibited (el hallazgo bloquea y el alimento no se ofrece a la
//   IA); "evitar", "limitar", "reducir" o "no se recomienda" es moderate (el
//   hallazgo advierte).
// - Celiaquía va por alimento, no por grupo: la taxonomía es neutra y las
//   variantes sin TACC comparten subgrupo con las que tienen gluten (DA-21).
//   Qué alimentos del catálogo contienen trigo, avena, cebada o centeno es un
//   criterio del desarrollador (origen V).
//
// El seed busca cada regla por patología y alimento o grupo, la pone al día y da
// de baja (active = false) las que salen de esta lista: no se borran porque los
// hallazgos las referencian. La fuente se muestra en el mensaje del hallazgo.

const SOURCES = {
  celiac: 'MSAL, GPC enfermedad celíaca (2016), pp. 35 y 43',
  celiacOats: 'MSAL, GPC enfermedad celíaca (2016), p. 43; ANMAT, Menú libre de gluten seguro (2023), p. 15',
  diabetesSugar: 'MSAL, GPC diabetes mellitus tipo 2 (2019), pp. 245 y 253',
  diabetesSweets: 'MSAL, GPC diabetes mellitus tipo 2 (2019), p. 251',
  hypertensionBroth: 'MSAL, GPC hipertensión arterial, versión breve (2026), p. 14',
  hypertensionSalt: 'MSAL, GPC hipertensión arterial, versión breve (2026), pp. 8 y 14',
  hypertensionColdCuts: 'MSAL, GAPA (2016), p. 26; MSAL, GPC hipertensión arterial, versión breve (2026), p. 14',
};

// Los alimentos del catálogo con trigo, avena, cebada o centeno ("exclusión de
// cuatro cereales …, sus derivados y productos que los contengan de por vida").
const CONTAINS_TACC = [
  'Pan francés',
  'Pan integral',
  'Pan lactal blanco',
  'Pan lactal integral',
  'Pan de salvado',
  'Pan árabe',
  'Harina de trigo',
  'Harina integral',
  'Pan rallado',
  'Tapas de tarta',
  'Tapas de empanada',
  'Fideos secos',
  'Fideos integrales',
  'Fideos frescos',
  'Masa para lasaña',
  'Avena arrollada',
  'Salvado de avena',
  'Salvado de trigo',
  'Trigo burgol',
  'Cebada perlada',
  'Galletitas de agua',
  'Galletitas integrales',
  'Galletitas de salvado',
  'Galletitas dulces simples',
  'Bizcochos de grasa',
  'Granola',
  'Malta',
];

const onFoods = (pathology, foods, severity, source) => foods.map((food) => ({ pathology, food, severity, source }));

const CLINICAL_RULES = [
  ...onFoods('Celiaquía', CONTAINS_TACC, 'prohibited', SOURCES.celiac),
  // "En Argentina no se recomienda que los pacientes consuman alimentos con avena
  // por el peligro de contaminación cruzada", aunque sea apta.
  ...onFoods('Celiaquía', ['Avena sin TACC'], 'moderate', SOURCES.celiacOats),

  ...onFoods('Diabetes', ['Azúcar', 'Azúcar mascabo'], 'moderate', SOURCES.diabetesSugar),
  ...onFoods('Diabetes', ['Mermelada', 'Dulce de leche', 'Galletitas dulces simples', 'Bizcochos de grasa'], 'moderate', SOURCES.diabetesSweets),

  // "No usar saborizantes en polvo o caldos deshidratados como condimentos".
  ...onFoods('Hipertensión', ['Caldo en cubo'], 'prohibited', SOURCES.hypertensionBroth),
  ...onFoods('Hipertensión', ['Sal fina'], 'moderate', SOURCES.hypertensionSalt),
  { pathology: 'Hipertensión', foodGroup: 'Fiambres y embutidos', severity: 'moderate', source: SOURCES.hypertensionColdCuts },
];

module.exports = { CLINICAL_RULES, SOURCES };
