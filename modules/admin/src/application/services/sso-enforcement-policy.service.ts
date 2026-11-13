export function ssoEnforcementChangeNeedsStepUp(change: { enforced: boolean }): boolean {
  return !change.enforced;
}
