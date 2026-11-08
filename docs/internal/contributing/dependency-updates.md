# Dependency updates

Dependabot opens grouped pull requests every week for npm, Python, the Dockerfile and GitHub Actions (`.github/dependabot.yml`). Treat each one as a change like any other.

- **Merge only when every check is green and the diff matches the title.** A minor or patch group must not change a major version. See the incident record in `04-INCIDENTS-LOG.md` (INC-12).
- **Major versions are upgraded by hand.** Dependabot ignores majors of `typescript`, `vitest`, `@vitest/*`, `express` and `@types/node`. Upgrade one at a time, in every workspace at once, in its own pull request with the full check passing.
- **`python/requirements-dev.txt` is generated, never edited.** It is the hash-pinned install set CI uses. After changing `python/pyproject.toml`, or to pick up new versions, regenerate it with the command in its header (add `--upgrade` for new versions). Dependabot ignores `docspec` and `docstring-parser`, which `pydoc-markdown` pins.
- **`package-lock.json` is regenerated with `npm install`,** including when resolving a merge conflict in it.
