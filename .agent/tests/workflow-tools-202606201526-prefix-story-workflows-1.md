# Test

Project: ltx-director-pro

Scene: workflow-tools

Target: prefix-story-workflows

Database ID: 1

## Preparation

- Use repository checkout at `/Volumes/disk-ultra/dev/ltx-director-pro`.
- Ensure generated workflow JSON files are present in `pro-workflows/`.

## Steps

1. Compile changed Python modules with `py_compile`.
2. Run JavaScript syntax checks on changed frontend files.
3. Parse every workflow JSON with `json.tool`.
4. Search docs for stale workflow paths that should not remain as active entry points.

## Boolean Rule

Pass is `true` only if all commands complete successfully and stale workflow references are limited to migration notes.

## Latest Result

Pass: `true`

Commands completed successfully:

- `PYTHONPYCACHEPREFIX=/private/tmp/codex-pyc python3 -m py_compile __init__.py workflow_tools.py`
- `node --check js/global_prefix.js`
- `node --check js/story_script.js`
- `node --check js/ltx_director.js`
- `node --check js/upscale_chunker.js`
- `for f in pro-workflows/*.json; do python3 -m json.tool "$f" >/dev/null || exit 1; done`
- `git diff --check`
- `rg -n "pro-workflows/(long-auto|pro-console|lip-sync|upscale)\\.json|video/long-auto" README.pro.md js pro-workflows`
