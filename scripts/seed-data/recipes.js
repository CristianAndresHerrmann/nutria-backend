// Recetas básicas comunes a todos los nutricionistas (T30, DA-34). Datos de prueba
// (RNF-08), sin contenido clínico: las cantidades son medidas caseras culinarias, no
// una prescripción.
//
// Origen (todo con código V, pendiente de validación): propuesta del desarrollador,
// sin revisión de una nutricionista. Criterios y pendientes para la entrevista en
// docs/recetas-basicas.md (repo raíz).
//
// - Ingredientes: solo alimentos comunes del catálogo (catalogs.js), por su nombre
//   exacto y sin repetir dentro de una receta. Ninguna lleva sal, azúcar, dulces,
//   caldo en cubo, salsa de soja ni fiambres: con alguno, una regla de patología
//   excluiría la receta completa. recipes.test.js controla todo esto.
// - Las de desayuno y merienda se ofrecen en las dos comidas, y lo mismo las de
//   almuerzo y cena.
// - El modelo no tiene un campo de porciones: el rendimiento va al inicio de
//   finalNote.
//
// El seed las carga por el servicio (recipe.service.upsertCommon), que rechaza un
// ingrediente que no sea común, y las pone al día por nombre: renombrar una deja la
// anterior en las bases ya cargadas.

const BREAKFAST_AND_SNACK = ['breakfast', 'afternoon_snack'];
const LUNCH_AND_DINNER = ['lunch', 'dinner'];

const steps = (...lines) => lines.map((line, index) => `${index + 1}. ${line}`).join('\n');

const COMMON_RECIPES = [
  // Desayuno y merienda
  {
    name: 'Pan integral con queso untable y tomate',
    cookingMethod: 'no_cooking',
    timeMinutes: 5,
    mealTypes: BREAKFAST_AND_SNACK,
    ingredients: [
      { food: 'Pan integral', quantityDescription: '2 rodajas' },
      { food: 'Queso untable descremado', quantityDescription: '2 cucharadas' },
      { food: 'Tomate', quantityDescription: '1/2 unidad' },
      { food: 'Orégano', quantityDescription: 'Una pizca' },
    ],
    preparation: steps(
      'Tostar el pan, si se prefiere.',
      'Untar con el queso.',
      'Agregar el tomate en rodajas y espolvorear el orégano.',
    ),
    finalNote: 'Rinde 1 porción.',
  },
  {
    name: 'Yogur con granola y frutillas',
    cookingMethod: 'no_cooking',
    timeMinutes: 5,
    mealTypes: BREAKFAST_AND_SNACK,
    ingredients: [
      { food: 'Yogur natural', quantityDescription: '1 pote' },
      { food: 'Granola', quantityDescription: '3 cucharadas' },
      { food: 'Frutilla', quantityDescription: '5 unidades' },
    ],
    preparation: steps('Lavar y cortar las frutillas.', 'Servir el yogur con la granola y las frutillas por encima.'),
    finalNote: 'Rinde 1 porción. La frutilla se puede reemplazar por otra fruta de estación.',
  },
  {
    name: 'Licuado de banana con leche y avena',
    cookingMethod: 'no_cooking',
    timeMinutes: 5,
    mealTypes: BREAKFAST_AND_SNACK,
    ingredients: [
      { food: 'Leche', quantityDescription: '1 taza' },
      { food: 'Banana', quantityDescription: '1 unidad' },
      { food: 'Avena arrollada', quantityDescription: '2 cucharadas' },
    ],
    preparation: steps('Pelar y trozar la banana.', 'Licuar con la leche y la avena hasta integrar.', 'Consumir en el momento.'),
    finalNote: 'Rinde 1 porción. Necesita licuadora.',
  },
  {
    name: 'Yogur con banana y semillas de lino',
    cookingMethod: 'no_cooking',
    timeMinutes: 5,
    mealTypes: BREAKFAST_AND_SNACK,
    ingredients: [
      { food: 'Yogur natural', quantityDescription: '1 pote' },
      { food: 'Banana', quantityDescription: '1 unidad' },
      { food: 'Semillas de lino', quantityDescription: '1 cucharada' },
    ],
    preparation: steps('Cortar la banana en rodajas.', 'Servir el yogur con la banana y las semillas por encima.'),
    finalNote: 'Rinde 1 porción.',
  },
  {
    name: 'Tostadas de arroz con palta y huevo duro',
    cookingMethod: 'stovetop',
    timeMinutes: 15,
    mealTypes: BREAKFAST_AND_SNACK,
    ingredients: [
      { food: 'Tostadas de arroz', quantityDescription: '3 unidades' },
      { food: 'Palta', quantityDescription: '1/4 unidad' },
      { food: 'Huevo', quantityDescription: '1 unidad' },
      { food: 'Pimienta', quantityDescription: 'A gusto' },
    ],
    preparation: steps(
      'Hervir el huevo 10 minutos, enfriarlo y pelarlo.',
      'Pisar la palta y untar las tostadas.',
      'Agregar el huevo en rodajas y condimentar con la pimienta.',
    ),
    finalNote: 'Rinde 1 porción.',
  },
  {
    name: 'Avena cocida con leche y pera',
    cookingMethod: 'stovetop',
    timeMinutes: 10,
    mealTypes: BREAKFAST_AND_SNACK,
    ingredients: [
      { food: 'Avena arrollada', quantityDescription: '4 cucharadas' },
      { food: 'Leche', quantityDescription: '1 taza' },
      { food: 'Pera', quantityDescription: '1 unidad' },
      { food: 'Nueces', quantityDescription: '2 unidades' },
    ],
    preparation: steps(
      'Calentar la leche con la avena a fuego bajo, revolviendo, unos 5 minutos hasta que espese.',
      'Servir con la pera en cubos y las nueces picadas.',
    ),
    finalNote: 'Rinde 1 porción.',
  },
  {
    name: 'Panqueques de avena y banana',
    cookingMethod: 'stovetop',
    timeMinutes: 15,
    mealTypes: BREAKFAST_AND_SNACK,
    ingredients: [
      { food: 'Banana', quantityDescription: '1 unidad madura' },
      { food: 'Huevo', quantityDescription: '1 unidad' },
      { food: 'Avena arrollada', quantityDescription: '3 cucharadas' },
      { food: 'Aceite de girasol', quantityDescription: 'Unas gotas' },
    ],
    preparation: steps(
      'Pisar la banana y mezclarla con el huevo y la avena.',
      'Calentar una sartén con unas gotas del aceite.',
      'Cocinar cucharadas de la mezcla unos 2 minutos por lado.',
    ),
    finalNote: 'Rinde 1 porción (4 panqueques chicos).',
  },

  // Almuerzo y cena
  {
    name: 'Pollo al horno con papas y zanahorias',
    cookingMethod: 'oven',
    timeMinutes: 60,
    mealTypes: LUNCH_AND_DINNER,
    ingredients: [
      { food: 'Pata y muslo de pollo', quantityDescription: '1 presa, sin piel' },
      { food: 'Papa', quantityDescription: '1 unidad mediana' },
      { food: 'Zanahoria', quantityDescription: '1 unidad' },
      { food: 'Cebolla', quantityDescription: '1/2 unidad' },
      { food: 'Aceite de oliva', quantityDescription: '1 cucharada' },
      { food: 'Orégano', quantityDescription: 'A gusto' },
    ],
    preparation: steps(
      'Precalentar el horno a temperatura media.',
      'Cortar la papa, la zanahoria y la cebolla en trozos y ubicarlas en una fuente con el pollo.',
      'Rociar con el aceite, espolvorear el orégano y hornear unos 50 minutos, dando vuelta a mitad de cocción, hasta que el pollo esté cocido.',
    ),
    finalNote: 'Rinde 1 porción.',
  },
  {
    name: 'Tarta de acelga y huevo',
    cookingMethod: 'oven',
    timeMinutes: 50,
    mealTypes: LUNCH_AND_DINNER,
    ingredients: [
      { food: 'Tapas de tarta', quantityDescription: '1 tapa' },
      { food: 'Acelga', quantityDescription: '1 atado' },
      { food: 'Cebolla', quantityDescription: '1 unidad' },
      { food: 'Huevo', quantityDescription: '3 unidades' },
      { food: 'Queso fresco', quantityDescription: '1 taza en cubos' },
      { food: 'Aceite de girasol', quantityDescription: '1 cucharada' },
    ],
    preparation: steps(
      'Lavar y picar la acelga y la cebolla, y rehogarlas en el aceite hasta que la acelga reduzca.',
      'Fuera del fuego, mezclar con los huevos batidos y el queso en cubos.',
      'Forrar una tartera con la tapa, volcar el relleno y hornear de 30 a 35 minutos a temperatura media.',
    ),
    finalNote: 'Rinde 4 porciones. Se conserva en heladera hasta el día siguiente.',
  },
  {
    name: 'Fideos con salsa de tomate y carne picada',
    cookingMethod: 'stovetop',
    timeMinutes: 30,
    mealTypes: LUNCH_AND_DINNER,
    ingredients: [
      { food: 'Fideos secos', quantityDescription: '1 taza' },
      { food: 'Carne picada magra', quantityDescription: '1/2 taza' },
      { food: 'Tomate en conserva', quantityDescription: '1/2 taza' },
      { food: 'Cebolla', quantityDescription: '1/2 unidad' },
      { food: 'Ajo', quantityDescription: '1 diente' },
      { food: 'Aceite de oliva', quantityDescription: '1 cucharadita' },
      { food: 'Orégano', quantityDescription: 'A gusto' },
    ],
    preparation: steps(
      'Rehogar la cebolla y el ajo picados en el aceite.',
      'Agregar la carne y cocinar hasta que cambie de color.',
      'Sumar el tomate y el orégano y cocinar 15 minutos a fuego bajo.',
      'Hervir los fideos en agua según el envase, colarlos y servirlos con la salsa.',
    ),
    finalNote: 'Rinde 1 porción.',
  },
  {
    name: 'Arroz con pollo y verduras',
    cookingMethod: 'stovetop',
    timeMinutes: 35,
    mealTypes: LUNCH_AND_DINNER,
    ingredients: [
      { food: 'Arroz blanco', quantityDescription: '1/2 taza, crudo' },
      { food: 'Pechuga de pollo', quantityDescription: '1/2 unidad' },
      { food: 'Morrón', quantityDescription: '1/4 unidad' },
      { food: 'Cebolla', quantityDescription: '1/2 unidad' },
      { food: 'Arvejas frescas', quantityDescription: '1/4 taza' },
      { food: 'Aceite de girasol', quantityDescription: '1 cucharadita' },
      { food: 'Pimentón', quantityDescription: 'Una pizca' },
    ],
    preparation: steps(
      'Dorar el pollo en cubos con el aceite y retirarlo.',
      'Rehogar la cebolla y el morrón picados.',
      'Agregar el arroz, el pimentón y el doble de agua, y cocinar tapado 15 minutos.',
      'Sumar el pollo y las arvejas y cocinar 5 minutos más.',
    ),
    finalNote: 'Rinde 1 porción. Se conserva en heladera hasta el día siguiente.',
  },
  {
    name: 'Milanesa de carne al horno con ensalada',
    cookingMethod: 'oven',
    timeMinutes: 35,
    mealTypes: LUNCH_AND_DINNER,
    ingredients: [
      { food: 'Carne vacuna magra', quantityDescription: '1 bife fino' },
      { food: 'Huevo', quantityDescription: '1 unidad' },
      { food: 'Pan rallado', quantityDescription: '1/2 taza' },
      { food: 'Ajo', quantityDescription: '1 diente' },
      { food: 'Perejil', quantityDescription: '1 cucharada, picado' },
      { food: 'Lechuga', quantityDescription: '1 taza' },
      { food: 'Tomate', quantityDescription: '1 unidad' },
      { food: 'Aceite de oliva', quantityDescription: '1 cucharada' },
    ],
    preparation: steps(
      'Batir el huevo con el ajo y el perejil picados.',
      'Pasar la carne por el huevo y después por el pan rallado.',
      'Hornear en una placa con unas gotas del aceite, a temperatura alta, unos 10 minutos por lado.',
      'Servir con la lechuga y el tomate, condimentados con el resto del aceite.',
    ),
    finalNote: 'Rinde 1 porción.',
  },
  {
    name: 'Merluza al horno con papa y zapallo',
    cookingMethod: 'oven',
    timeMinutes: 40,
    mealTypes: LUNCH_AND_DINNER,
    ingredients: [
      { food: 'Merluza', quantityDescription: '1 filet' },
      { food: 'Papa', quantityDescription: '1 unidad' },
      { food: 'Zapallo', quantityDescription: '1 taza en cubos' },
      { food: 'Limón', quantityDescription: '1/2 unidad' },
      { food: 'Aceite de oliva', quantityDescription: '1 cucharada' },
      { food: 'Perejil', quantityDescription: 'A gusto' },
    ],
    preparation: steps(
      'Cortar la papa y el zapallo en cubos y hornearlos con la mitad del aceite durante 20 minutos.',
      'Agregar el filet y rociarlo con el jugo del limón y el resto del aceite.',
      'Hornear 15 minutos más, hasta que el pescado se separe en láminas, y espolvorear el perejil.',
    ),
    finalNote: 'Rinde 1 porción.',
  },
  {
    name: 'Guiso de lentejas con verduras',
    cookingMethod: 'stovetop',
    timeMinutes: 50,
    mealTypes: LUNCH_AND_DINNER,
    ingredients: [
      { food: 'Lentejas', quantityDescription: '1/2 taza, secas' },
      { food: 'Papa', quantityDescription: '1 unidad chica' },
      { food: 'Zanahoria', quantityDescription: '1/2 unidad' },
      { food: 'Cebolla', quantityDescription: '1/2 unidad' },
      { food: 'Morrón', quantityDescription: '1/4 unidad' },
      { food: 'Tomate en conserva', quantityDescription: '1/2 taza' },
      { food: 'Pimentón', quantityDescription: 'Una pizca' },
      { food: 'Laurel', quantityDescription: '1 hoja' },
      { food: 'Aceite de girasol', quantityDescription: '1 cucharadita' },
    ],
    preparation: steps(
      'Rehogar la cebolla y el morrón picados en el aceite.',
      'Agregar la papa y la zanahoria en cubos, las lentejas enjuagadas, el tomate, el pimentón, el laurel y agua hasta cubrir.',
      'Cocinar a fuego bajo de 35 a 40 minutos, agregando agua si hace falta, hasta que las lentejas estén tiernas.',
    ),
    finalNote: 'Rinde 2 porciones. Se conserva en heladera hasta el día siguiente.',
  },
  {
    name: 'Tortilla de papa con tomate',
    cookingMethod: 'stovetop',
    timeMinutes: 35,
    mealTypes: LUNCH_AND_DINNER,
    ingredients: [
      { food: 'Papa', quantityDescription: '2 unidades chicas' },
      { food: 'Huevo', quantityDescription: '2 unidades' },
      { food: 'Cebolla', quantityDescription: '1/2 unidad' },
      { food: 'Aceite de girasol', quantityDescription: '1 cucharada' },
      { food: 'Tomate', quantityDescription: '1 unidad' },
    ],
    preparation: steps(
      'Cortar las papas en cubos chicos, hervirlas 10 minutos en agua y escurrirlas.',
      'Rehogar la cebolla en la mitad del aceite y sumar las papas.',
      'Batir los huevos, mezclarlos con la papa y la cebolla y volcar en una sartén con el resto del aceite.',
      'Cocinar tapado a fuego bajo unos 8 minutos, dar vuelta y cocinar 5 minutos más.',
      'Servir con el tomate en rodajas.',
    ),
    finalNote: 'Rinde 2 porciones.',
  },
  {
    name: 'Ensalada de garbanzos, choclo y tomate',
    cookingMethod: 'no_cooking',
    timeMinutes: 10,
    mealTypes: LUNCH_AND_DINNER,
    ingredients: [
      { food: 'Garbanzos', quantityDescription: '1/2 taza, en conserva' },
      { food: 'Choclo', quantityDescription: '1/2 taza en granos, en conserva' },
      { food: 'Tomate', quantityDescription: '1 unidad' },
      { food: 'Cebolla de verdeo', quantityDescription: '1 tallo' },
      { food: 'Aceite de oliva', quantityDescription: '1 cucharada' },
      { food: 'Limón', quantityDescription: '1/2 unidad' },
    ],
    preparation: steps(
      'Enjuagar y escurrir los garbanzos y el choclo.',
      'Cortar el tomate y la cebolla de verdeo.',
      'Mezclar todo y condimentar con el aceite y el jugo del limón.',
    ),
    finalNote: 'Rinde 1 porción. Se puede llevar como vianda y se conserva en heladera hasta el día siguiente.',
  },
  {
    name: 'Wrap de pan árabe con atún y vegetales',
    cookingMethod: 'no_cooking',
    timeMinutes: 10,
    mealTypes: LUNCH_AND_DINNER,
    ingredients: [
      { food: 'Pan árabe', quantityDescription: '1 unidad' },
      { food: 'Atún al natural', quantityDescription: '1/2 lata' },
      { food: 'Lechuga', quantityDescription: '2 hojas' },
      { food: 'Tomate', quantityDescription: '1/2 unidad' },
      { food: 'Zanahoria', quantityDescription: '1/2 unidad' },
      { food: 'Queso untable descremado', quantityDescription: '1 cucharada' },
    ],
    preparation: steps(
      'Untar el pan con el queso.',
      'Distribuir la lechuga, el tomate en rodajas, la zanahoria rallada y el atún escurrido.',
      'Enrollar y cortar al medio.',
    ),
    finalNote: 'Rinde 1 porción. Se puede llevar como vianda.',
  },
];

module.exports = { COMMON_RECIPES };
