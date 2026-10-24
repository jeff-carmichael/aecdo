## Summary

<!-- What does this change and why? Link the issue if there is one (schema changes need one). -->

## Type of change

- [ ] CLI
- [ ] Schema (additive, current version)
- [ ] Schema (breaking, new `ontology/v<x.y.z>/` directory)
- [ ] Docs / tooling only

## Checklist

- [ ] `npm test` and `npm run lint` pass
- [ ] `CHANGELOG.md` has an entry under `[Unreleased]` (required by CI for `ontology/` or `cli/src/` changes)
- [ ] New or changed commands: `--help` text, README Usage, and `.claude/skills/aecdo/SKILL.md` updated
- [ ] Schema changes: walked the checklist in [CONTRIBUTING.md](https://github.com/jeff-carmichael/aecdo/blob/main/CONTRIBUTING.md#files-that-must-be-updated-for-a-schema-change)
- [ ] New runtime file reads are embedded in `cli/bin/embed-assets.ts` (so the standalone binary still works)

## Testing

<!-- How did you verify this? Commands run, output checked. -->
