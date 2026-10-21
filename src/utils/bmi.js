// IMC (RF-11): se calcula al leer, nunca se guarda, a partir de un peso en kg y
// una talla en cm (unidades fijas en measurement.schema). Solo el número: sin
// categorías ni umbrales, que serían una regla clínica.
//
// Supuesto (docs/decisiones/imc-calculado-con-la-talla-mas-reciente.md): para
// cada peso se usa la talla más reciente con fecha igual o anterior a la del
// peso. Una talla posterior no cuenta, porque el IMC de esa fecha no podía
// conocerla.

function calculateBmi(weightKg, heightCm) {
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

function toTime(date) {
  return new Date(date).getTime();
}

// La más reciente con fecha <= `date`. Dos tallas del mismo día se desempatan
// por id: la tabla no tiene fecha de alta, y así el resultado no depende del
// orden en que lleguen las filas.
function heightAt(heights, date) {
  let chosen = null;
  for (const height of heights) {
    if (toTime(height.date) > toTime(date)) continue;
    const newer = !chosen || toTime(height.date) > toTime(chosen.date);
    const sameDayTieBreak = chosen && toTime(height.date) === toTime(chosen.date) && height.id > chosen.id;
    if (newer || sameDayTieBreak) chosen = height;
  }
  return chosen;
}

// Devuelve las mismas filas con `bmi`: número en un peso con talla disponible,
// null en el resto. `value` tiene que venir ya como número.
function withBmi(measurements) {
  const heights = measurements.filter((measurement) => measurement.type === 'height');

  return measurements.map((measurement) => {
    if (measurement.type !== 'weight') return { ...measurement, bmi: null };
    const height = heightAt(heights, measurement.date);
    return { ...measurement, bmi: height ? calculateBmi(measurement.value, height.value) : null };
  });
}

module.exports = { calculateBmi, withBmi };
