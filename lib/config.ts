type Env = Record<string, string | undefined>;

export const isDemoMode = (env: Env = process.env): boolean => env.DEMO_MODE === "true";

// The role switcher lets anyone act as anyone, so demo mode must never
// reach the pilot, and must never be open on a deployed link.
export function configProblems(env: Env = process.env): string[] {
  const problems: string[] = [];

  if (env.APP_ENV !== "demo" && env.APP_ENV !== "pilot") {
    problems.push('APP_ENV must be "demo" or "pilot".');
  }
  if (env.APP_ENV === "pilot" && isDemoMode(env)) {
    problems.push("DEMO_MODE must be off when APP_ENV=pilot.");
  }
  if (isDemoMode(env) && env.NODE_ENV === "production" && !env.DEMO_ACCESS_PASSWORD) {
    problems.push("DEMO_ACCESS_PASSWORD is required on a deployed demo.");
  }

  return problems;
}

/** Checks the Basic Auth header sent by the browser. The username is always "demo". */
export function hasDemoAccess(authorization: string | null, password: string): boolean {
  if (!authorization?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(authorization.slice("Basic ".length), "base64").toString("utf8");
  return decoded === `demo:${password}`;
}
