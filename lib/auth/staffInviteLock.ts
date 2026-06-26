/** Blocks ShopAuthContext from reacting during owner-side staff signUp. */
let locked = false;

export function setStaffInviteLock(value: boolean): void {
  locked = value;
}

export function isStaffInviteLocked(): boolean {
  return locked;
}
