# TypeScript versions

Two TypeScript versions are installed, each for what it can do ([ADR-0015](../adr/ADR-0015-TypeScript-7-Compiler-With-TypeScript-6-For-Tools.md)).

| Package                             | Version | Used for                                                            |
| ----------------------------------- | ------- | ------------------------------------------------------------------- |
| `typescript7` (`npm:typescript@^7`) | 7       | Every build and typecheck: the npm scripts, CI, Docker and Vercel   |
| `typescript`                        | 6       | Tools that need the compiler API: ESLint, TypeDoc, two repo scripts |

- Build and typecheck with the npm scripts: `npm run build` and `npm run typecheck`. They call TypeScript 7 (`node node_modules/typescript7/bin/tsc`).
- A bare `tsc` or `npx tsc` runs TypeScript 6. The code compiles under both, but CI checks with 7, so 7 is the one that must pass.
- Code that imports the compiler API keeps `import ts from "typescript"`. TypeScript 7 has no such API.
- TypeScript majors are upgraded by hand; Dependabot ignores them. ADR-0015 lists the steps to finish the move to 7 once `typescript-eslint` and `typedoc` support it.
