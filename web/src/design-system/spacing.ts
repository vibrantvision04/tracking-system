// Spacing scale — 4 px base unit, keys 0–16, rem string values
// e.g. spacing[4] === "1rem", spacing[1] === "0.25rem"
const base = 4;

export const spacing = Object.fromEntries(
  Array.from({ length: 17 }, (_, k) => [k, `${(k * base) / 16}rem`])
) as Record<number, string>;
