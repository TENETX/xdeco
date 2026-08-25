import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const DAEMON_HOST = process.env.XDECO_HOST ?? "127.0.0.1";
export const DAEMON_PORT = Number(process.env.XDECO_PORT ?? 4317);

export const CODEX_HOME = process.env.CODEX_HOME
  ? resolve(process.env.CODEX_HOME)
  : join(homedir(), ".codex");

export const CODEX_GLOBAL_STATE_PATH = join(CODEX_HOME, ".codex-global-state.json");
export const CODEX_STATE_DATABASE_PATH = join(CODEX_HOME, "state_5.sqlite");
export const CODEX_SESSION_INDEX_PATH = join(CODEX_HOME, "session_index.jsonl");

export const DATA_DIR = process.env.XDECO_DATA_DIR
  ? resolve(process.env.XDECO_DATA_DIR)
  : join(CODEX_HOME, "xdeco");

export const LEGACY_DATABASE_PATH = join(CODEX_HOME, "plan-orchestrator", "plan-orchestrator.sqlite");

export const DATABASE_PATH = process.env.XDECO_DATABASE
  ? resolve(process.env.XDECO_DATABASE)
  : join(DATA_DIR, "xdeco.sqlite");

export const CAPTURE_MODEL = process.env.XDECO_CAPTURE_MODEL ?? "gpt-5.6-luna";
export const EXECUTION_MODEL = process.env.XDECO_EXECUTION_MODEL ?? "gpt-5.6-terra";
