/** Iniciales de un nombre (hasta 2), para cuando no hay logo o foto. Ej: "Quantum Sails" → "QS". */
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter((word) => /^[A-Za-zÀ-ÿ]/.test(word))
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
