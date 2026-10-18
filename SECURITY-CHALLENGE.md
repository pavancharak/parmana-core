# Parmana security challenge

Parmana claims that an action runs only when policy allows it, with a signed human approval
where policy asks for one, and that every decision leaves a signed record anyone can check.
This challenge asks you to prove a claim wrong on a copy of Parmana that you run yourself.

There is no deadline. The challenge applies to the current `main` branch and to any later
commit.

## The target: your own local copy

Attack only a copy you run on your own machine:

- **The self hosted stack (preferred).** Follow the
  [self hosted quickstart](https://docs.parmanasystems.com/self-hosted/quickstart). It runs the
  server in production mode with Postgres, two signing keys and maker checker, on
  `http://127.0.0.1:3000`. A break against this setup is the strongest result.
- **The code and its tests.** Build the repository as described in
  [EVALUATION.md](EVALUATION.md) and attack the packages directly, for example by writing a
  test that shows an invariant failing. `npm run evaluate` runs the 16 attacks we already
  test; a new one that gets through is a finding.

**Never attack** the hosted API, the public sandbox, the docs site, any Parmana Systems
infrastructure, or any deployment you do not run yourself. Do not use real credentials for
HubSpot, GitHub, Slack, Paytm or any other third party service; use the mock connectors and
stand ins that ship with the repository.

## Two roles: operator and attacker

On your own copy you play two roles. As the **operator** you install Parmana, hold every key,
the database and both governance credentials, and you are trusted, the same as the operator
of a real deployment. As the **attacker** you hold only what the next section lists. A break
is something the attacker does; anything that needs the operator's position does not count,
because in a real deployment the attacker does not have it.

## What counts as a break

Each item below is a claim Parmana makes about an attacker who holds at most a valid agent API
key, a captured authorization or a captured, used approval. Show any of these on the target
and it counts:

| #   | Break                                                                                                                                    | Related claims (docs/CLAIMS.md) |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1   | A connector is called for an action the policy did not approve                                                                           | 2.4, 2.25                       |
| 2   | An action whose policy needs a signed human approval runs without a valid one for that action, resource and amount                       | 2.42, 2.44, 2.47                |
| 3   | An action runs with parameters different from the ones authorized, such as a different amount or target                                  | 2.10, 2.44                      |
| 4   | One authorization or one approval is used twice                                                                                          | 2.10, 2.20, 2.42                |
| 5   | A capability is evaluated under a policy other than the one bound to it, or under a policy version that is not the approved, current one | 2.22, 2.27, 2.36                |
| 6   | A policy change takes effect with only one person's credentials, or without a step up signature                                          | 2.26, 2.34                      |
| 7   | A request is accepted without a valid API key, or for a caller, principal or capability the key does not allow                           | 2.16, 3.16                      |
| 8   | A Trust Record or Refusal Record that the instance did not sign, or that was changed after signing, still verifies offline               | 2.5, 2.6, 3.11                  |
| 9   | A connector credential appears in a response, a decision, a record or anything else the caller can read                                  | 2.23                            |
| 10  | A request reads or writes a file outside the policy directory                                                                            | none yet                        |

Something not on this list can still be a finding. If you think it breaks a claim in
[docs/CLAIMS.md](docs/CLAIMS.md), report it.

## What does not count

These are stated assumptions or limits, listed in the
[Audit guide](https://docs.parmanasystems.com/evaluation/audit-guide#what-an-attacker-controls)
and on the [Limitations](https://docs.parmanasystems.com/security/limitations) page:

- A break that needs an approver's private key, Parmana's signing key, the gateway key, a
  connector's own credential, write access to the database, or both the maker and the checker
  credentials.
- A break that only works with a development or test setting turned on, such as
  `PARMANA_AUTH_DISABLED=true` or `NODE_ENV` other than `production`, unless you show the
  setting can be reached in a production configuration.
- Calling a downstream system directly, without going through Parmana, or an agent that holds
  its own credentials to that system. Parmana governs only actions routed through it and
  does not enforce anything at the network level.
- Changing the code, image, container, Docker installation or host that Parmana runs from,
  before or after it starts, or exploiting the machine you download or run it on. That is
  control of the trust boundary itself, not a way through it (attacker A9 in
  [THREAT-MODEL.md](THREAT-MODEL.md)). A malicious change that reaches the published source
  or the signed release image is a finding; report it.
- Denial of service, load or rate limit testing against anything but your own copy.
- Social engineering, and anything that targets a person.
- A known vulnerability in a dependency, unless you show it working against Parmana.

## How to report

Report privately, as described in [SECURITY.md](SECURITY.md): email
**founder@parmanasystems.com**, or use GitHub's private vulnerability reporting (Security tab,
**Report a vulnerability**). Do not open a public issue for a break. Include:

- the commit you tested (`git rev-parse HEAD`);
- the setup: the self hosted stack or the code, and any setting you changed;
- what the attacker held, from the list above;
- the steps or a test that reproduces it, and what you observed;
- the `evaluation-report.json` from `npm run evaluate` on the same commit, if you ran it.

We acknowledge within 3 business days and aim to reply with a fix timeline or a question
within 10. Please wait for the fix before you publish.

## Recognition

There is no cash reward. With your permission, every confirmed break is credited by name in
this file, in [docs/VERIFICATION-GAPS.md](docs/VERIFICATION-GAPS.md) where the gap and its fix
are recorded, and in the changelog of the release that fixes it. A claim that a break disproves
is corrected or withdrawn in docs/CLAIMS.md.

## Good faith

Parmana's license permits reading, building and running the code to evaluate it. Testing
your own local copy under these rules is that kind of use. We will not pursue legal action
against anyone who tests in good faith within these rules and reports privately.

## Confirmed breaks

None reported yet.
