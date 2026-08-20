import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const DAEMON_HOST = process.env.PLAN_ORCHESTRATOR_HOST ?? "127.0.0.1";
export const DAEMON_PORT = Number(process.env.PLAN_ORCHESTRATOR_PORT ?? 4317);

export const CODEX_HOME = process.env.CODEX_HOME
  ? resolve(process.env.CODEX_HOME)
  : join(homedir(), ".codex");

export const CODEX_GLOBAL_STATE_PATH = join(CODEX_HOME, ".codex-global-state.json");

export const DATA_DIR = process.env.PLAN_ORCHESTRATOR_DATA_DIR
  ? resolve(process.env.PLAN_ORCHESTRATOR_DATA_DIR)
  : join(CODEX_HOME, "plan-orchestrator");

export const DATABASE_PATH = process.env.PLAN_ORCHESTRATOR_DATABASE
  ? resolve(process.env.PLAN_ORCHESTRATOR_DATABASE)
  : join(DATA_DIR, "plan-orchestrator.sqlite");

export const CAPTURE_MODEL = process.env.PLAN_ORCHESTRATOR_CAPTURE_MODEL ?? "gpt-5.6-luna";
export const EXECUTION_MODEL = process.env.PLAN_ORCHESTRATOR_EXECUTION_MODEL ?? "gpt-5.6-terra";
