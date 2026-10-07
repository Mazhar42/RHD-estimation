// Prepares the backend the E2E run talks to: creates the admin account the
// tests log in as (via app/cli.py create-admin -- the same path a real
// deployment uses, since self-service registration is closed) and loads
// the fixture data from backend/scripts/seed_e2e.py. Both are idempotent.
// Requires E2E_BACKEND_DIR, pointing at a backend configured (via its env)
// for the same throwaway database the E2E backend server uses.
import { execFileSync } from "node:child_process";

export const E2E_ADMIN_USERNAME = "e2e_admin";
export const E2E_ADMIN_EMAIL = "e2e_admin@example.com";
export const E2E_ADMIN_PASSWORD = "e2e-test-password-123";

function runPython(pythonBin, args, backendDir, extraEnv = {}) {
  return execFileSync(pythonBin, args, {
    cwd: backendDir,
    env: { ...process.env, ...extraEnv },
    stdio: "pipe",
  });
}

export default async function globalSetup() {
  const backendDir = process.env.E2E_BACKEND_DIR;
  if (!backendDir) {
    console.warn(
      "E2E_BACKEND_DIR is not set -- skipping admin/fixture bootstrap. " +
        "See e2e/README.md.",
    );
    return;
  }
  const pythonBin = process.env.E2E_PYTHON_BIN || "python";
  try {
    runPython(
      pythonBin,
      ["-m", "app.cli", "create-admin", "--username", E2E_ADMIN_USERNAME, "--email", E2E_ADMIN_EMAIL],
      backendDir,
      { ADMIN_PASSWORD: E2E_ADMIN_PASSWORD },
    );
  } catch (err) {
    const output = `${err.stdout || ""}${err.stderr || ""}`;
    if (!output.includes("already exists")) throw err;
  }
  runPython(pythonBin, ["-m", "scripts.seed_e2e"], backendDir);
}
