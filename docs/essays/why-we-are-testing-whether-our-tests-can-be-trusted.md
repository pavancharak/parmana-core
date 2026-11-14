# Why We Are Testing Whether Our Tests Can Be Trusted

*The engineering thinking behind mutation testing at Parmana Systems*

*Suggested subtitle: Why building trustworthy autonomous systems requires us to test not just our code, but whether our tests can detect when that code is wrong.*

---

If a system claims that unauthorized actions cannot execute, we must test whether our tests would detect the mechanisms that make that claim false.

That sentence is the argument of this essay. The rest explains why we think it matters, why ordinary testing does not fully answer it, and what we are doing about it at Parmana.

## What happens if our code is wrong but our tests still pass?

Every engineering team should occasionally ask itself this question.

We spend considerable effort writing tests, improving coverage, fixing failing cases and checking that new features behave as expected. When the suite passes, we gain confidence that the implementation works.

That confidence is worth less than it appears. A test can pass without testing what we think it tests. It can execute a function without verifying its important behavior. It can check that a response exists without checking whether the response is correct. It can exercise a security mechanism without checking whether that mechanism would notice a violation.

So software can have extensive coverage and still contain weaknesses that its tests cannot detect. For most software, that is an inconvenience. For software that enforces business authority, it is a serious problem, and it is the reason we have started applying mutation testing to the cryptographic core of Parmana.

## The problem we are working on

AI systems are moving beyond answering questions and generating recommendations. They are being connected to business systems, APIs, databases, payment infrastructure, enterprise applications and operational workflows. An agent may interpret a request, identify an appropriate action and initiate an operation.

There is a fundamental difference between understanding what should happen and having the authority to make it happen.

A business may allow an agent to approve refunds up to a set amount. It may let another agent read specific records but forbid modifying them. It may let an automated workflow initiate payments only to approved vendors. These are not suggestions. They are the boundaries of business authority, and when software acts autonomously, the systems that execute actions must enforce them.

Parmana exists to make that enforcement explicit and checkable. We want businesses to be able to:

- **Declare authority** explicitly.
- **Verify authorization** deterministically before execution.
- **Control execution** so it stays within those boundaries.
- **Produce evidence** that can be independently verified afterward.

Each step depends on the one before it, and none of them can simply be assumed.

## Why ordinary testing is not enough

Suppose a business authorizes an agent to approve refunds up to ₹10,000. The authorization check compares the requested amount with the limit.

A test submits a refund of ₹5,000 and expects approval. Another submits ₹15,000 and expects rejection. Both pass. That sounds reasonable.

Now suppose someone accidentally changes the comparison. The original check is:

```
requestedAmount <= authorizedLimit
```

The changed version is:

```
requestedAmount >= authorizedLimit
```

Would our tests catch this? Under that change, the ₹5,000 request is rejected and the ₹15,000 request is approved. If the tests check both cases, they fail, and we have evidence that the suite detects this class of error. If they do not fail, we have learned that a fundamental inversion of the authorization rule goes unnoticed, which is far more important than any coverage number.

This is the distinction that matters. Expected-behavior tests show that the implementation handles the cases we thought of. They do not show that the tests would notice when the implementation stops doing what it should. That second property is what we need to establish for security-critical code.

## What mutation testing does

Mutation testing starts from the opposite direction. Rather than asking whether the implementation passes its tests, it deliberately introduces small changes into the implementation and asks whether the tests notice.

These changes, called mutants, might reverse a comparison, flip a Boolean condition, remove a validation check, change a return value, alter a logical expression, or delete an operation that protects an invariant.

The engine runs the existing test suite against each mutant:

- If a test fails, the mutant is **killed**. The suite detected the change.
- If every test still passes, the mutant **survives**. The suite did not detect the change.

A surviving mutant does not automatically mean the code is defective. Some mutants are behaviorally equivalent to the original, and some touch code the tests never exercise in a meaningful way. But every meaningful survivor deserves investigation, because it points to a place where our confidence is larger than our evidence.

This changes the question we ask about quality. Coverage asks which code ran. Mutation testing asks how well our tests challenge the behavior of that code.

## Why we are starting with cryptography

In Parmana, cryptography is not an isolated feature. It is part of the foundation for our evidence and integrity guarantees. When the system produces evidence that an authorized action occurred, that evidence must correspond to the actual decision and execution. That depends on several properties:

- **Deterministic serialization.** The same logical data must produce the same canonical representation. If serialization varies, hashes and signatures can disagree for reasons unrelated to the data's content.
- **Hash integrity.** Changes to protected data must be detectable.
- **Digital signatures.** Evidence must be verifiable against the appropriate trusted key.
- **Verification.** The verifier must correctly establish whether the evidence and its integrity relationships hold, and must reject the invalid cases, not only accept the valid ones.
- **Fail-closed behavior.** When required verification cannot be established, the system must not proceed as though authorization or integrity had been demonstrated.

Each property can be broken by a small change. A verifier that returns success too early, a signature check that is skipped on an error path, or a serializer that omits a field can all look plausible in review and still defeat the guarantee. These are exactly the kinds of defects that expected-behavior tests can miss, because the tests were written by someone thinking about the intended behavior.

A hash function returning a value does not show that the system is trustworthy. A signature being produced does not show that it was verified correctly. A verifier returning success does not show that it rejects every relevant invalid input. The surrounding implementation and the tests protecting it matter just as much, which is why we are examining the cryptographic layer first.

## Where the run stands

We have started a mutation run against the crypto package. At the checkpoint we observed:

- 51 source files identified for mutation
- 1,316 mutants generated
- Four parallel test-runner processes
- 315 mutants tested, with 62 surviving and zero timeouts

This is an ongoing run, not a final result, and the numbers should be read that way. A mutation score is not the goal. We do not intend to raise a score by making tests fail more often. We want to know whether our tests protect the guarantees that matter.

When the run finishes, we will examine each surviving mutant individually. Some will be equivalent and harmless. Others may reveal missing assertions, untested branches, or places where a test confirms that something happened without confirming what happened. Each of those findings tells us where the suite's confidence is not earned.

## Accountability requires evidence

There is a broader principle behind this work.

When ordinary software miscalculates, the error may be caught later by validation. When autonomous systems act on behalf of a business, the consequences are different. An unauthorized payment may already have been sent. A customer record may already have changed. A refund may already have been approved. The business cannot rely on discovering an authorization failure after the fact. It needs confidence that the boundary was enforced before the action happened.

And when someone asks whether an action was authorized, the answer should not depend on trusting an AI agent's account of what it did. It should be possible to examine the evidence and verify the relevant properties independently.

That is the purpose of deterministic authority enforcement and verifiable evidence. But making that claim creates a responsibility. If our system is designed to reject unauthorized actions, our tests must challenge the conditions under which an unauthorized action could be accepted. If the system preserves integrity, our tests must challenge the mechanisms that detect integrity violations. If the system fails closed, our tests must examine the circumstances in which verification becomes impossible and confirm that the system refuses in those cases.

Asserting that these mechanisms exist is not enough. We have to test whether they behave as intended, including when their implementation is deliberately broken.

## What mutation testing does not prove

A high mutation score does not prove that software is correct. It does not rule out vulnerabilities, defects or unexpected behavior. It is one layer of engineering assurance, and it should be presented that way.

What it offers is something coverage cannot: evidence that the existing tests detect a meaningful set of deliberate changes to the implementation. For software responsible for enforcing boundaries that businesses depend on, that is a useful question to ask, and it is better to learn the answer during development than after a system has been trusted with real authority.

## Building systems that can be challenged

Our work rests on a simple idea: **AI can interpret; businesses must retain authority.**

An autonomous system should not decide its own permissions through interpretation. Authority should be explicit. Authorization should be deterministic. Execution should stay within those boundaries. Evidence should make the result independently verifiable.

That principle applies to the product, and it applies to how we build the product. We should not ask people to trust our claims about deterministic enforcement simply because we wrote tests. We should keep challenging the mechanisms behind those claims, including the tests themselves.

> We are not just testing whether Parmana works. We are testing whether our tests can detect when the mechanisms protecting business authority stop working.

Authority must be enforced. Evidence must be verifiable. And the tests that protect those guarantees must themselves be tested.

---

*Parmana Systems: Accountability infrastructure for autonomous systems. Authority defines the boundaries. Parmana enforces them. Evidence establishes accountability.*
