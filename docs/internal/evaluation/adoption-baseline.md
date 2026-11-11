# Adoption baseline: protocol and quickstart pre-read

Status: Protocol ready. The baseline has not been run yet.

Related: RFC-0029 (Make Parmana easier to adopt).

---

# Part 1. Protocol for the baseline session

## Participant

- A developer who is integrating an agent, and who has not used Parmana before.
- They must not have read the internal records (RFCs, ADRs, the gap log) before the session.

## Materials

- Only the public documentation: https://docs.parmanasystems.com/quickstart and the pages it links to.
- A machine with Node 24, Python, Docker and git, and nothing Parmana-specific installed.
- A timer, and a recording sheet (Part 1, section "Recording").

## Task

Give the developer this sentence and nothing else:

"Using the public docs, get one agent action approved by a person, executed by Parmana, and recorded. Then check the record with the offline verifier."

Do not explain the approver step, the policy or the settings. If they ask, write the question down and answer only with what the docs say.

## Start and stop

- Start: the timer starts when the developer opens the first documentation page.
- Stop: the timer stops when the offline verifier reports the record as valid. If they do not reach that point within 60 minutes, stop, record the time, and note where they got stuck.

## Recording

- Total time, in minutes.
- Number of settings or environment variables changed.
- Whether they used Docker, or cloned and built the server from source.
- Every point where they stopped, asked a question, read something outside the quickstart, or made a mistake, with the step number.
- Whether they used the offline verifier, and whether it worked first time.
- Their own words for what was hardest, in one sentence.

Do not comment on the product during the session, and do not fix the docs for them. The point is to find where the docs fail.

---

# Part 2. Pre-read of the quickstart

This is a check of `docs/site/quickstart.mdx` against the Phase 1 path in RFC-0029. It is not the baseline. It shows where a developer is likely to stop, so the session can focus on the rest.

## Defects to fix before the session

1. **The first command is wrong.** Step 1 says `cp.env.example.env`. It should be `cp .env.example .env`. A developer who copies it literally will fail at the first step.
2. **A sentence is cut off.** In the sample after the TypeScript code: "The two samples above were run as shown, with the demo key, against a server" ends without finishing. The reader cannot tell what the sentence claimed.
3. **Docker is not mentioned.** The Phase 1 path is `docker compose up`, which already exists in the repository (`docker-compose.yml`). The quickstart requires a source checkout, `npm ci`, `npm run build` and `npm run dev`. A developer who wants to try Parmana in a container has no path from this page.
4. **The stated time is not the measured time.** The page says "under 10 minutes". RFC-0029 sets 30 minutes as the target for a developer who has not used Parmana. The 10-minute claim should be checked, not repeated.
5. **The settings are hard to understand.** The local run needs `NODE_ENV=test`, `PARMANA_STORAGE=memory`, `PARMANA_API_KEYS` and `PARMANA_TEST_APPROVER_PUBLIC_KEY_FILE`. The page explains that `memory` alone is not enough, and that `NODE_ENV=test` is needed. A developer will reasonably ask why a test setting is required to run a local server.
6. **Three key-generation commands.** Steps 2 and 3 create three key pairs with three different commands. A developer will not know which key does what.
7. **An approval comes before the transaction, and the signals list is long.** The transaction needs nine signals, and most of them are not explained where they are used. The developer will copy them without knowing what each one does.
8. **A detour through authentication.** Step 5 calls `/version` without a key, gets a 401, then retries with the key. This is useful for understanding authentication, but it is not on the path to the first approved action.
9. **Two SDK forms in TypeScript.** The client is built with an `endpoint` and also a `transport` that repeats the same `endpoint` and `apiKey`. The developer will not know which form is current.

## Likely stopping points

- Step 1, if the typo is copied literally.
- Step 2 or 3, where the three key commands must run in order, with a path under the home directory.
- Step 4, where the environment variables must be set on one command line, and the Windows form is not shown.
- Step 8, where the approval and the transaction are in one long code block, with nine signals.

## Things that will work

- The status and version checks are short and show the expected output.
- The real-output section shows what success looks like, so the developer knows when they have reached the end.
- The TypeScript and Python code blocks match each other, and both appear next to each other.

## What this means for the baseline

The developer is likely to stop at the first command or at the key setup. The baseline will mostly measure those points, so fix defects 1 and 2 before the session. The Docker path (defect 3) is the most important change for Phase 1, and it should be tested by the baseline itself rather than assumed.
