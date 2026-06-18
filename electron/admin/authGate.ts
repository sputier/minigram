// Comparaison volontairement simple : ADMIN_PASSWORD vit dans un .env local
// et gitignored sur la machine du parent, il n'y a pas de surface d'attaque
// distante à mitiger ici (pas de timing-safe compare nécessaire).
export function checkAdminPassword(input: string, expected: string): boolean {
  if (!expected) return false
  return input === expected
}
