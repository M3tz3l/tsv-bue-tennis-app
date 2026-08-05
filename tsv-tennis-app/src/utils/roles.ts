export function isOrgaRole(role?: string | null) {
  return role?.trim().toLowerCase() === 'orga';
}
