import { renderLayout } from "./layout.js";
import { escapeHtml, escapedJson } from "./escapeHtml.js";
import type { PendingPolicyChangeWithDiff } from "../types.js";

function formatDate(iso: string): string {
  const parsed = new Date(iso);

  return escapeHtml(
    Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleString(),
  );
}

function metaRow(label: string, value: string): string {
  return `<li><span class="label">${escapeHtml(label)}</span>${escapeHtml(value)}</li>`;
}

/**
 * This UI never collects an approval/rejection -- see the package
 * README. These instructions are the entire "how a checker actually
 * acts on this" story: sign locally (the private key never leaves
 * the checker's machine), then submit the signed envelope over HTTP
 * themselves, with their own bearer token, outside this UI.
 */
function renderInstructions(
  change: PendingPolicyChangeWithDiff,
  apiBaseUrl: string,
): string {
  const id = change.pendingPolicyChangeId;

  return `
<div class="instructions">
  <h2>How to approve or reject this change</h2>
  <p>
    This page is read-only by design. Approving or rejecting requires a
    step-up authorization envelope signed with <em>your own</em> private
    key, on <em>your own</em> machine -- never through this UI, and never
    through a server that could see or use that key on your behalf.
  </p>

  <p><strong>1. Sign the envelope locally</strong>, substituting your own key file and key id:</p>
  <pre>npx tsx scripts/sign-policy-change-step-up.ts \\
  --private-key-file ./checker.step-up.private.pem \\
  --key-id YOUR_STEP_UP_KEY_ID \\
  --pending-policy-change-id ${escapeHtml(id)} \\
  --action approve</pre>
  <p>(Use <code>--action reject</code> for a rejection instead.)</p>

  <p><strong>2. Submit it to the API</strong>, with your own bearer token and the envelope the script printed:</p>
  <pre>curl -X POST ${escapeHtml(apiBaseUrl)}/policies/pending-changes/${escapeHtml(id)}/approve \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"stepUpAuthorization": &lt;paste the signed envelope JSON here&gt;}'</pre>

  <p>To reject instead, POST to <code>/reject</code> and include a <code>rejectionReason</code>:</p>
  <pre>curl -X POST ${escapeHtml(apiBaseUrl)}/policies/pending-changes/${escapeHtml(id)}/reject \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"rejectionReason": "your reason here", "stepUpAuthorization": &lt;paste the signed envelope JSON here&gt;}'</pre>
</div>`;
}

export function renderDiffPage(
  change: PendingPolicyChangeWithDiff,
  callerId: string,
  apiBaseUrl: string,
): string {
  const currentPanel =
    change.diff.current === null
      ? `<p style="padding:0.75rem; color:#57606a;">No existing content at this version -- this is a brand-new policy version, not a replacement.</p>`
      : `<pre>${escapedJson(change.diff.current)}</pre>`;

  const metaItems = [
    metaRow("Policy", `${change.policyName} @ ${change.policyVersion}`),
    metaRow("Proposed by", change.proposedBy),
    metaRow("Proposed at", formatDate(change.proposedAt)),
    metaRow("Reason", change.reason),
    metaRow("Status", change.status),
  ];

  if (change.resolvedBy !== undefined) {
    metaItems.push(metaRow("Resolved by", change.resolvedBy));
  }

  if (change.resolvedAt !== undefined) {
    metaItems.push(metaRow("Resolved at", formatDate(change.resolvedAt)));
  }

  if (change.rejectionReason !== undefined) {
    metaItems.push(metaRow("Rejection reason", change.rejectionReason));
  }

  const body = `
<p><a href="/">&larr; Back to pending changes</a></p>
<h2>${escapeHtml(change.policyName)} @ ${escapeHtml(change.policyVersion)}</h2>
<ul class="meta-list">
  ${metaItems.join("\n  ")}
</ul>

<div class="diff-columns">
  <div class="diff-panel current">
    <h3>Current</h3>
    ${currentPanel}
  </div>
  <div class="diff-panel proposed">
    <h3>Proposed</h3>
    <pre>${escapedJson(change.diff.proposed)}</pre>
  </div>
</div>

${change.status === "PENDING_APPROVAL" ? renderInstructions(change, apiBaseUrl) : ""}`;

  return renderLayout({
    title: `${change.policyName} @ ${change.policyVersion}`,
    callerId,
    body,
  });
}
