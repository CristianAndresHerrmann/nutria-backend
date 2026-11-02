const { Router } = require('express');
const recipeController = require('../controllers/recipe.controller');
const { requireNutritionist } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { emptyQuerySchema, catalogIdParamsSchema } = require('../schemas/common.schema');
const { createRecipeSchema, updateRecipeSchema, setRecipeAvailabilitySchema, listRecipesQuerySchema } = require('../schemas/recipe.schema');
const { RECIPE_NOT_FOUND_MESSAGE } = require('../services/recipe.service');

const router = Router();

// Un id que no es UUID responde 404, igual que una receta inexistente o privada de
// otro nutricionista.
const byId = { notFoundOnInvalidParams: RECIPE_NOT_FOUND_MESSAGE };

// No hay DELETE: la baja es lógica, con availableInCatalog = false en PATCH o PUT. Las
// recetas básicas comunes (T30) se leen, pero no se editan ni se dan de baja.

/**
 * @openapi
 * /recipes:
 *   get:
 *     tags: [Recetas]
 *     summary: Lista las recetas básicas comunes y las del nutricionista autenticado
 *     description: >
 *       Devuelve las recetas básicas comunes y las del nutricionista del token (nunca las privadas
 *       de otro), ordenadas por nombre; `own` las distingue. Por defecto,
 *       solo las disponibles en el catálogo. Con `patientId`, deja afuera las recetas con algún
 *       ingrediente comprendido en una alergia, intolerancia o rechazo del paciente, sea por el
 *       alimento o por su grupo, incluidos los subgrupos (RF-28). Las preferencias y las patologías
 *       no excluyen recetas. Los filtros se aplican igual a las comunes y a las propias.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: mealType
 *         in: query
 *         description: Tipo de comida. Una receta con varios tipos aparece en cada uno.
 *         schema: { type: string, enum: [breakfast, lunch, afternoon_snack, dinner] }
 *       - name: includeUnavailable
 *         in: query
 *         description: Con `true`, incluye las recetas dadas de baja.
 *         schema: { type: string, enum: ['true', 'false'], default: 'false' }
 *       - name: patientId
 *         in: query
 *         description: >
 *           Paciente del nutricionista autenticado. Uno inexistente o de otro nutricionista
 *           responde 404.
 *         schema: { type: string, format: uuid }
 *     responses:
 *       '200':
 *         description: Recetas que cumplen el filtro, eventualmente ninguna
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Recipe' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '404': { $ref: '#/components/responses/PatientNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get('/recipes', requireNutritionist, validate({ query: listRecipesQuerySchema }), recipeController.listRecipes);

/**
 * @openapi
 * /recipes/{id}:
 *   get:
 *     tags: [Recetas]
 *     summary: Obtiene una receta básica común o del nutricionista autenticado
 *     description: >
 *       Incluye las dadas de baja. Una receta privada de otro nutricionista responde 404, igual
 *       que una inexistente.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/RecipeId'
 *     responses:
 *       '200':
 *         description: Receta encontrada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Recipe' }
 *       '400': { $ref: '#/components/responses/UnknownQueryParam' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '404': { $ref: '#/components/responses/RecipeNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get(
  '/recipes/:id',
  requireNutritionist,
  validate({ params: catalogIdParamsSchema, query: emptyQuerySchema }, byId),
  recipeController.getRecipe,
);

/**
 * @openapi
 * /recipes:
 *   post:
 *     tags: [Recetas]
 *     summary: Da de alta una receta
 *     description: >
 *       Siempre crea una receta privada: queda asociada al nutricionista del token (también al
 *       duplicar una receta básica común desde el frontend), con origen `professional`, y nace
 *       disponible en el catálogo. Cada ingrediente es un alimento del catálogo (común o privado
 *       propio, vigente); el orden es la posición en la lista.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RecipeInput' }
 *     responses:
 *       '201':
 *         description: Receta creada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Recipe' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.post(
  '/recipes',
  requireNutritionist,
  validate({ query: emptyQuerySchema, body: createRecipeSchema }),
  recipeController.createRecipe,
);

/**
 * @openapi
 * /recipes/{id}:
 *   put:
 *     tags: [Recetas]
 *     summary: Edita una receta del nutricionista autenticado
 *     description: >
 *       Reemplazo completo: un campo opcional omitido se guarda como `null`, y los ingredientes y
 *       tipos de comida se reemplazan por los que llegan. `availableInCatalog: false` la da de baja
 *       y `true` la reactiva; omitido, conserva el valor que tenía. Un alimento dado de baja que ya
 *       estaba en la receta se puede conservar, pero no agregar. Una receta básica común responde
 *       403: es de solo lectura.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/RecipeId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RecipeUpdateInput' }
 *     responses:
 *       '200':
 *         description: Receta actualizada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Recipe' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/CommonRecipeReadOnly' }
 *       '404': { $ref: '#/components/responses/RecipeNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.put(
  '/recipes/:id',
  requireNutritionist,
  validate({ params: catalogIdParamsSchema, query: emptyQuerySchema, body: updateRecipeSchema }, byId),
  recipeController.updateRecipe,
);

/**
 * @openapi
 * /recipes/{id}:
 *   patch:
 *     tags: [Recetas]
 *     summary: Cambia la disponibilidad de una receta propia
 *     description: >
 *       `availableInCatalog: false` la da de baja y `true` la reactiva. Solo cambia
 *       la disponibilidad: conserva los datos, ingredientes y tipos de comida actuales,
 *       aunque el listado del cliente esté desactualizado. Una receta común responde
 *       403; una privada de otro nutricionista o inexistente, 404.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/RecipeId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RecipeAvailabilityInput' }
 *     responses:
 *       '200':
 *         description: Receta con su disponibilidad actualizada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Recipe' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/CommonRecipeReadOnly' }
 *       '404': { $ref: '#/components/responses/RecipeNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.patch(
  '/recipes/:id',
  requireNutritionist,
  validate({ params: catalogIdParamsSchema, query: emptyQuerySchema, body: setRecipeAvailabilitySchema }, byId),
  recipeController.setRecipeAvailability,
);

module.exports = router;
