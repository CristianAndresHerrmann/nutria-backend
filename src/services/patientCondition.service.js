const patientRepository = require('../repositories/patient.repository');
const patientConditionRepository = require('../repositories/patientCondition.repository');
const foodRepository = require('../repositories/food.repository');
const foodGroupRepository = require('../repositories/foodGroup.repository');
const pathologyRepository = require('../repositories/pathology.repository');
const AppError = require('../utils/AppError');
const { PATIENT_NOT_FOUND_MESSAGE } = require('./patient.service');

const CONDITION_NOT_FOUND_MESSAGE = 'Condición no encontrada';
const DUPLICATE_CONDITION_MESSAGE = 'El paciente ya tiene registrada esta condición';
const PATHOLOGY_NOT_FOUND_MESSAGE = 'La patología no existe';
const FOOD_NOT_FOUND_MESSAGE = 'El alimento no existe';
const FOOD_INACTIVE_MESSAGE = 'El alimento está dado de baja';
const GROUP_NOT_FOUND_MESSAGE = 'El grupo de alimentos no existe';

function validationError(field, message) {
  return new AppError(400, message, { code: 'VALIDATION_ERROR', details: { fields: { [field]: message } } });
}

// El campo que identifica a la condición junto con el tipo: ahí se señala un
// duplicado. El schema garantiza que hay exactamente uno.
function targetField(data) {
  if (data.pathologyId) return 'pathologyId';
  return data.foodId ? 'foodId' : 'foodGroupId';
}

// La fecha de registro es NOT NULL con default del día. Si no viene, en el alta
// la pone la base y en la edición se conserva la que tenía.
function withoutEmptyDate({ registeredAt, ...data }) {
  return registeredAt ? { ...data, registeredAt } : data;
}

// Condiciones del paciente (RF-04 patologías, RF-07). Solo se registran: las
// reglas clínicas que se derivan de una patología son del Incremento 3.
//
// Orden de los chequeos: paciente/condición ajenos o inexistentes (404), destino
// que no existe en el catálogo (400), condición repetida (409).
function createPatientConditionService({
  patientRepository: patients,
  patientConditionRepository: repository,
  foodRepository: foods,
  foodGroupRepository: groups,
  pathologyRepository: pathologies,
}) {
  // Un paciente de otro nutricionista da el mismo 404 que uno inexistente.
  async function assertPatient(patientId, nutritionistId) {
    if (!(await patients.findByIdForNutritionist(patientId, nutritionistId))) {
      throw new AppError(404, PATIENT_NOT_FOUND_MESSAGE);
    }
  }

  async function findOwnCondition(id, patientId, nutritionistId) {
    const condition = await repository.findByIdForPatient(id, patientId, nutritionistId);
    if (!condition) throw new AppError(404, CONDITION_NOT_FOUND_MESSAGE);
    return condition;
  }

  // Sin este chequeo, un id inexistente llegaría a la base como violación de FK
  // y terminaría en un 500. Un alimento privado de otro nutricionista cuenta
  // como inexistente: no lo ve. Uno dado de baja no se puede elegir, pero una
  // condición que ya lo tenía se puede seguir editando (ej. sus observaciones).
  async function assertTargetExists(data, nutritionistId, previous = null) {
    if (data.pathologyId && !(await pathologies.findById(data.pathologyId))) {
      throw validationError('pathologyId', PATHOLOGY_NOT_FOUND_MESSAGE);
    }
    if (data.foodGroupId && !(await groups.findById(data.foodGroupId))) {
      throw validationError('foodGroupId', GROUP_NOT_FOUND_MESSAGE);
    }
    if (data.foodId) {
      const food = await foods.findVisibleById(data.foodId, nutritionistId);
      if (!food) throw validationError('foodId', FOOD_NOT_FOUND_MESSAGE);
      if (!food.active && previous?.foodId !== data.foodId) throw validationError('foodId', FOOD_INACTIVE_MESSAGE);
    }
  }

  async function assertNotDuplicate(patientId, nutritionistId, data, excludeId) {
    if (await repository.findDuplicate(patientId, nutritionistId, data, excludeId)) {
      throw new AppError(409, DUPLICATE_CONDITION_MESSAGE, {
        details: { fields: { [targetField(data)]: DUPLICATE_CONDITION_MESSAGE } },
      });
    }
  }

  return {
    async list(patientId, nutritionistId) {
      await assertPatient(patientId, nutritionistId);
      return repository.findAllForPatient(patientId, nutritionistId);
    },

    async create(patientId, nutritionistId, data) {
      await assertPatient(patientId, nutritionistId);
      await assertTargetExists(data, nutritionistId);
      await assertNotDuplicate(patientId, nutritionistId, data);
      return repository.create(patientId, withoutEmptyDate(data));
    },

    // Reemplazo completo, como PUT /patients/:id: el tipo y el destino pueden
    // cambiar, y un campo omitido (observations) queda en null.
    async update(id, patientId, nutritionistId, data) {
      await assertPatient(patientId, nutritionistId);
      const previous = await findOwnCondition(id, patientId, nutritionistId);
      await assertTargetExists(data, nutritionistId, previous);
      await assertNotDuplicate(patientId, nutritionistId, data, id);

      const updated = await repository.updateForPatient(id, patientId, nutritionistId, withoutEmptyDate(data));
      if (!updated) throw new AppError(404, CONDITION_NOT_FOUND_MESSAGE);
      return updated;
    },

    async remove(id, patientId, nutritionistId) {
      await assertPatient(patientId, nutritionistId);
      if (!(await repository.deleteForPatient(id, patientId, nutritionistId))) {
        throw new AppError(404, CONDITION_NOT_FOUND_MESSAGE);
      }
    },
  };
}

module.exports = createPatientConditionService({
  patientRepository,
  patientConditionRepository,
  foodRepository,
  foodGroupRepository,
  pathologyRepository,
});
module.exports.createPatientConditionService = createPatientConditionService;
module.exports.CONDITION_NOT_FOUND_MESSAGE = CONDITION_NOT_FOUND_MESSAGE;
module.exports.DUPLICATE_CONDITION_MESSAGE = DUPLICATE_CONDITION_MESSAGE;
