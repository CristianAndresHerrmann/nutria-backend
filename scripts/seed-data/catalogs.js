// Catálogos comunes a todos los nutricionistas (T14). Datos de prueba (RNF-08):
// una base mínima para desarrollar y probar, sin reglas ni contenido clínico. La
// taxonomía de grupos es neutra a propósito: qué grupo restringe cada patología
// lo define el motor de reglas (Incremento 3), no el nombre del grupo.

// Padres antes que hijos: el seed los recorre en orden.
const FOOD_GROUPS = [
  { name: 'Cereales y derivados' },
  { name: 'Panificados y harinas', parent: 'Cereales y derivados' },
  { name: 'Arroz y granos', parent: 'Cereales y derivados' },
  { name: 'Lácteos' },
  { name: 'Carnes, pescados y huevos' },
  { name: 'Carnes', parent: 'Carnes, pescados y huevos' },
  { name: 'Aves', parent: 'Carnes, pescados y huevos' },
  { name: 'Pescados', parent: 'Carnes, pescados y huevos' },
  { name: 'Huevos', parent: 'Carnes, pescados y huevos' },
  { name: 'Legumbres' },
  { name: 'Verduras' },
  { name: 'Frutas' },
  { name: 'Grasas y aceites' },
  { name: 'Frutos secos y semillas' },
  { name: 'Infusiones' },
];

const FOODS = [
  { name: 'Pan francés', group: 'Panificados y harinas', categories: ['carbohydrate'] },
  { name: 'Fideos secos', group: 'Panificados y harinas', categories: ['carbohydrate'] },
  { name: 'Harina de trigo', group: 'Panificados y harinas', categories: ['carbohydrate'] },
  { name: 'Avena arrollada', group: 'Arroz y granos', categories: ['carbohydrate', 'fiber'] },
  { name: 'Arroz blanco', group: 'Arroz y granos', categories: ['carbohydrate'] },
  { name: 'Arroz integral', group: 'Arroz y granos', categories: ['carbohydrate', 'fiber'] },
  { name: 'Leche', group: 'Lácteos', categories: ['protein'] },
  { name: 'Yogur natural', group: 'Lácteos', categories: ['protein'] },
  { name: 'Queso fresco', group: 'Lácteos', categories: ['protein'] },
  { name: 'Carne vacuna magra', group: 'Carnes', categories: ['protein'] },
  { name: 'Pechuga de pollo', group: 'Aves', categories: ['protein'] },
  { name: 'Merluza', group: 'Pescados', categories: ['protein'] },
  { name: 'Atún al natural', group: 'Pescados', categories: ['protein'] },
  { name: 'Huevo', group: 'Huevos', categories: ['protein'] },
  { name: 'Lentejas', group: 'Legumbres', categories: ['protein', 'fiber'] },
  { name: 'Garbanzos', group: 'Legumbres', categories: ['protein', 'fiber'] },
  { name: 'Zanahoria', group: 'Verduras', categories: ['vegetable', 'fiber'] },
  { name: 'Tomate', group: 'Verduras', categories: ['vegetable'] },
  { name: 'Lechuga', group: 'Verduras', categories: ['vegetable'] },
  { name: 'Zapallo', group: 'Verduras', categories: ['vegetable'] },
  { name: 'Papa', group: 'Verduras', categories: ['carbohydrate'] },
  { name: 'Manzana', group: 'Frutas', categories: ['fiber'] },
  { name: 'Banana', group: 'Frutas', categories: ['carbohydrate', 'fiber'] },
  { name: 'Naranja', group: 'Frutas', categories: ['fiber'] },
  { name: 'Palta', group: 'Frutas', categories: ['healthy_fat'] },
  { name: 'Aceite de oliva', group: 'Grasas y aceites', categories: ['healthy_fat'] },
  { name: 'Nueces', group: 'Frutos secos y semillas', categories: ['healthy_fat'] },
  { name: 'Semillas de chía', group: 'Frutos secos y semillas', categories: ['healthy_fat', 'fiber'] },
  { name: 'Té', group: 'Infusiones', categories: ['infusion'] },
  { name: 'Mate', group: 'Infusiones', categories: ['infusion'] },
  { name: 'Café', group: 'Infusiones', categories: ['infusion'] },
];

// Las patologías de los casos de prueba del Plan de Proyecto.
const PATHOLOGY_DESCRIPTION = 'Dato de prueba: patología de los casos de prueba del Plan de Proyecto.';

const PATHOLOGIES = [
  { name: 'Celiaquía', description: PATHOLOGY_DESCRIPTION },
  { name: 'Diabetes', description: PATHOLOGY_DESCRIPTION },
  { name: 'Hipertensión', description: PATHOLOGY_DESCRIPTION },
];

// Recomendaciones clínicas comunes (T22): solo textos de ejemplo, identificados
// como ficticios en el título y en el texto. El contenido clínico real lo carga
// la nutricionista; el sistema no lo redacta.
const RECOMMENDATION_TEXT =
  'Texto de ejemplo ficticio (RNF-08): no es una recomendación clínica. El contenido real lo carga la nutricionista.';

const RECOMMENDATIONS = PATHOLOGIES.map(({ name }) => ({
  pathology: name,
  title: `Ejemplo ficticio: recomendación común para ${name}`,
  text: RECOMMENDATION_TEXT,
}));

module.exports = { FOOD_GROUPS, FOODS, PATHOLOGIES, RECOMMENDATIONS, RECOMMENDATION_TEXT };
