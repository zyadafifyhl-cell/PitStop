/** Blocks onAuthStateChange side effects while signIn/signUp runs (prevents Supabase auth deadlocks). */
let depth = 0;

export function beginAuthMutation(): void {
  depth += 1;
}

export function endAuthMutation(): void {
  depth = Math.max(0, depth - 1);
}

export function isAuthMutationInProgress(): boolean {
  return depth > 0;
}
