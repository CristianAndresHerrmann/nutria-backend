// nutritionistId no viaja: la única privada que un nutricionista puede ver es
// suya. En su lugar va `own`, que el frontend usa para ofrecer la edición solo
// en las propias (las comunes son de solo lectura).
function serializeRecommendation(recommendation) {
  const { nutritionistId, ...rest } = recommendation;
  return { ...rest, own: nutritionistId !== null };
}

function serializeRecommendations(recommendations) {
  return recommendations.map(serializeRecommendation);
}

module.exports = { serializeRecommendation, serializeRecommendations };
