#!/usr/bin/env bash
set -euo pipefail

skill_root="${CODEX_PLUGIN_CREATOR_ROOT:-${HOME}/.codex/skills/.system/plugin-creator}"
validator="${skill_root}/scripts/validate_plugin.py"
bundled_python="${HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
python_bin="${PLAN_ORCHESTRATOR_PYTHON:-python3}"
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
validator_venv="${PLAN_ORCHESTRATOR_VALIDATOR_VENV:-${repo_dir}/.data/plugin-validator-venv}"

if ! "${python_bin}" -c 'import yaml' >/dev/null 2>&1; then
  if [[ -x "${bundled_python}" ]] && "${bundled_python}" -c 'import yaml' >/dev/null 2>&1; then
    python_bin="${bundled_python}"
  else
    if [[ ! -x "${validator_venv}/bin/python3" ]]; then
      "${python_bin}" -m venv "${validator_venv}"
    fi
    "${validator_venv}/bin/python3" -m pip install --quiet PyYAML
    python_bin="${validator_venv}/bin/python3"
  fi
fi

cd "${repo_dir}"
exec "${python_bin}" "${validator}" plugins/plan-orchestrator
