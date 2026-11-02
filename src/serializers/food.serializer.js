// nutritionistId no viaja: identifica al dueño de un alimento privado, y el único
// privado que un nutricionista puede ver es suyo. Tampoco viajan quién lo cargó
// ni cuándo (T25): son datos de la actividad del catálogo, solo para el
// administrador. Las filas de food_category se aplanan a la lista de valores del
// enum.
function serializeFood(food) {
  const { nutritionistId: _nutritionistId, createdById: _createdById, createdAt: _createdAt, categories, ...rest } = food;
  return { ...rest, categories: categories.map(({ category }) => category) };
}

function serializeFoods(foods) {
  return foods.map(serializeFood);
}

// Panel del administrador (T25). Lista blanca de la cuenta: id y nombre, nunca
// el email ni nada de sus pacientes.
function serializeAccount(account) {
  return account ? { id: account.id, name: account.name } : null;
}

// Vista del administrador: si es común, de quién es si es privado, quién lo cargó
// y cuándo.
function serializeAdminFood(food) {
  const { id, name, active, foodGroupId, foodGroup, categories, nutritionistId, nutritionist, createdBy, createdAt } = food;
  return {
    id,
    name,
    active,
    foodGroupId,
    foodGroup,
    categories: categories.map(({ category }) => category),
    common: nutritionistId === null,
    owner: serializeAccount(nutritionist),
    createdBy: serializeAccount(createdBy),
    createdAt,
  };
}

function serializeAdminFoods(foods) {
  return foods.map(serializeAdminFood);
}

// Actividad del catálogo: qué alimento cargó cada nutricionista y cuándo, y si
// sigue privado o pasó al común.
function serializeCatalogActivity(entries) {
  return entries.map(({ id, name, active, nutritionistId, createdAt, createdBy }) => ({
    id,
    name,
    active,
    common: nutritionistId === null,
    createdBy: serializeAccount(createdBy),
    createdAt,
  }));
}

module.exports = { serializeFood, serializeFoods, serializeAdminFood, serializeAdminFoods, serializeCatalogActivity };
