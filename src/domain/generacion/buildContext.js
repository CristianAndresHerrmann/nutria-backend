const { categoriesOf } = require('../reglas/catalogIndex');

// Contexto mínimo y anonimizado que el backend envía a nutria-ia para generar el
// plan (IA2, RNF-07; contrato de T33, DA-28). Función pura.
//
// Se arma por lista blanca: cada campo del contrato se copia de un campo puntual
// del paciente. Lo que no está acá no viaja: nombre, apellido, fecha de
// nacimiento, contacto, convivencia, responsable, objetivo, peso, antecedentes,
// medicación, tratamientos, patrones de ingesta, mediciones, observaciones de las
// condiciones (texto libre) ni ningún id interno. El servicio es la segunda
// barrera: rechaza con 422 cualquier campo no declarado.
//
// Los elementos del catálogo viajan con códigos cortos (G1, A1, R1) en vez de
// UUID. `codes` traduce cada código a su entidad al resolver la propuesta, y
// queda solo en memoria.

// Topes de ContextText y Name del contrato. Un texto más largo se trunca: si
// no, el servicio respondería 422 y el plan no se podría generar.
const CONTEXT_TEXT_MAX_LENGTH = 500;
const NAME_MAX_LENGTH = 120;

function clip(value, maxLength) {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (text.length === 0) return undefined;
  return text.length > maxLength ? text.slice(0, maxLength).trimEnd() : text;
}

// Sin claves undefined ni null: el contexto que se guarda en ai_generation es
// exactamente el que se envió.
function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null));
}

// Los textos libres los escribe el profesional, y la lista blanca no impide que
// traigan un dato identificatorio ("trabaja con su hermano Juan Pérez, tel. 342
// 555-0101"). Antes de enviarlos se reemplazan los emails, los teléfonos y las
// palabras del nombre y apellido del paciente y de su responsable. No detecta
// nombres de terceros: es un filtro determinístico, no un reconocedor de
// entidades.
const REDACTED = '[dato omitido]';
const EMAIL_PATTERN = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
// Siete o más dígitos, con separadores comunes en un teléfono entre ellos. Los
// separadores no incluyen dígitos, así el patrón no tiene backtracking
// exponencial sobre un texto largo.
const PHONE_PATTERN = /\+?\(?\d(?:[\s().-]{0,3}\d){6,}/g;
const MIN_NAME_WORD_LENGTH = 3;

// Cada letra con o sin tilde, para que "Martin" encuentre "Martín" y al revés.
const ACCENT_VARIANTS = { a: 'aá', e: 'eé', i: 'ií', o: 'oó', u: 'uúü', n: 'nñ' };

function stripAccents(text) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function accentInsensitiveSource(word) {
  return [...stripAccents(word).toLowerCase()]
    .map((char) => (ACCENT_VARIANTS[char] ? `[${ACCENT_VARIANTS[char]}]` : escapeRegExp(char)))
    .join('');
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function namePatterns(patient) {
  const words = [patient.firstName, patient.lastName, patient.guardianName]
    .filter((value) => typeof value === 'string')
    .flatMap((value) => value.split(/[^\p{L}]+/u))
    .filter((word) => word.length >= MIN_NAME_WORD_LENGTH);

  return [...new Set(words.map((word) => stripAccents(word).toLowerCase()))].map(
    (word) => new RegExp(`(?<![\\p{L}\\p{N}])${accentInsensitiveSource(word)}(?![\\p{L}\\p{N}])`, 'giu'),
  );
}

function redact(text, patterns) {
  return patterns.reduce(
    (result, pattern) => result.replace(pattern, REDACTED),
    text.replace(EMAIL_PATTERN, REDACTED).replace(PHONE_PATTERN, REDACTED),
  );
}

// Se filtra antes de truncar, así un email o un teléfono no queda cortado a
// medias y sin reemplazar.
function contextText(value, patterns) {
  if (typeof value !== 'string') return undefined;
  return clip(redact(value, patterns), CONTEXT_TEXT_MAX_LENGTH);
}

function conditionName(condition) {
  return clip(condition.pathology?.name ?? condition.food?.name ?? condition.foodGroup?.name, NAME_MAX_LENGTH);
}

const byName = (a, b) => a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id);

function withCodes(prefix, entities) {
  return [...entities].sort(byName).map((entity, index) => [`${prefix}${index + 1}`, entity]);
}

// patient: fila de Patient; conditions: las del paciente con el nombre de lo
// que referencian (patientCondition.repository); catalog: lo que devuelve
// allowedCatalog.
function buildGenerationContext({ patient, conditions, catalog, mealTypes }) {
  const groups = withCodes('G', catalog.groups);
  const foods = withCodes('A', catalog.foods);
  const recipes = withCodes('R', catalog.recipes);
  const groupCodeById = new Map(groups.map(([code, group]) => [group.id, code]));
  const patterns = namePatterns(patient);
  const text = (value) => contextText(value, patterns);

  const context = {
    meal_types: [...mealTypes],
    conditions: conditions.map((condition) => ({ type: condition.type, name: conditionName(condition) })),
    cooking: compact({
      cooks: patient.cooks,
      likes_cooking: patient.likesCooking,
      cooking_time: text(patient.cookingTime),
      home_equipment: text(patient.homeEquipment),
      usual_shopping_place: text(patient.usualShoppingPlace),
    }),
    outside_home: compact({
      meals_outside_home: text(patient.mealsOutsideHome),
      outside_equipment: text(patient.outsideEquipment),
    }),
    work: compact({
      occupation: text(patient.occupation),
      work_context: text(patient.workContext),
    }),
    habits: compact({
      physical_activity: text(patient.physicalActivity),
      smoking: text(patient.smoking),
      alcohol: text(patient.alcohol),
      meal_schedule: text(patient.mealSchedule),
      sleep_schedule: text(patient.sleepSchedule),
    }),
    catalog: {
      food_groups: groups.map(([code, group]) => ({ code, name: clip(group.name, NAME_MAX_LENGTH) })),
      foods: foods.map(([code, food]) => ({
        code,
        name: clip(food.name, NAME_MAX_LENGTH),
        group_code: groupCodeById.get(food.foodGroupId),
        categories: categoriesOf(food),
      })),
    },
    candidate_recipes: recipes.map(([code, recipe]) =>
      compact({
        code,
        name: clip(recipe.name, NAME_MAX_LENGTH),
        meal_types: recipe.mealTypes,
        cooking_method: recipe.cookingMethod,
        time_minutes: recipe.timeMinutes,
      }),
    ),
  };

  const codes = {
    foods: new Map(foods),
    groups: new Map(groups),
    recipes: new Map(recipes),
  };

  return { context, codes };
}

module.exports = { buildGenerationContext, CONTEXT_TEXT_MAX_LENGTH };
