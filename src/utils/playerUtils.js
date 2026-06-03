// Normalize a player name for fuzzy matching across data sources.
// Strips periods, common name suffixes, and extra whitespace so that
// "D.J. Moore", "DJ Moore" and "Kenneth Walker III", "Kenneth Walker" compare equal.
export function normalizeName(name) {
  if (!name) return ''
  return name
    .replace(/\./g, '')               // remove all periods
    .replace(/\s+(III|II|IV|Jr|Sr)\s*$/i, '')  // strip trailing suffix
    .replace(/\s+/g, ' ')             // collapse internal whitespace
    .trim()
    .toLowerCase()
}

// Find a player in an array by normalized name match.
export function findPlayerByName(universe, name) {
  const needle = normalizeName(name)
  return (universe || []).find(p => normalizeName(p.Player) === needle) || null
}
