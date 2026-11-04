# Python reference docs

`npm run generate:python-sdk-reference` rewrites `docs/site/sdks/reference/python/` and `docs/site/docs.json`. The output is formatted with Prettier, so a clean regeneration leaves the committed pages unchanged. Run `git status` afterwards to confirm.

- **Tool version.** The generator runs `python -m pydoc_markdown`. Install the version pinned in `python/requirements-dev.txt` (`pydoc-markdown==4.8.2`) first.
- **Descriptions.** pydoc-markdown writes no page description, so they live in `scripts/python-sdk-reference/descriptions.json`, keyed by page path. A new page without an entry makes the generator fail. Add its description to that file. CI regenerates the reference on every pull request and fails if the committed docs differ from the output.
- **Docstrings.** Prettier can read an underscore inside a word, such as `POLICY_DENIED`, as emphasis and turn it into an asterisk. Put identifiers like that in a code span in the docstring.
