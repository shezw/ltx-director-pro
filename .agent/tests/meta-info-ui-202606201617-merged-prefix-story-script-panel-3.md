# Test

Project: ltx-director-pro

Scene: meta-info-ui

Target: merged-prefix-story-script-panel

Database ID: 3

## Preparation

- Use repository checkout at `/Volumes/disk-ultra/dev/ltx-director-pro`.

## Steps

1. Compile changed Python modules.
2. Run JavaScript syntax checks on changed frontend files.
3. Parse every workflow JSON.
4. Check each workflow has exactly one `ShezwMetaInfo` node and zero old UI nodes.
5. Run `git diff --check`.

## Boolean Rule

Pass is `true` only if all checks complete successfully and retained workflows use the merged Meta Info node.

## Latest Result

Pass: `true`

Commands completed successfully:

- `PYTHONPYCACHEPREFIX=/private/tmp/codex-pyc python3 -m py_compile __init__.py workflow_tools.py`
- `node --check js/global_prefix.js`
- `node --check js/story_script.js`
- `for f in pro-workflows/*.json; do python3 -m json.tool "$f" >/dev/null || exit 1; done`
- workflow node structure check for exactly one `ShezwMetaInfo` and zero old UI nodes
- stale `GLOBAL PREFIX` / `STORY SCRIPT` UI wording check
- `git diff --check`
