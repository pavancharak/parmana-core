import { renderLayout } from "./layout.js";
import { escapeHtml } from "./escapeHtml.js";
import type { PendingPolicyChangeWithDiff } from "../types.js";

function formatDate(iso: string): string {
  const parsed = new Date(iso);

  return escapeHtml(
    Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleString(),
  );
}

function statusBadge(status: string): string {
  return `<span class="status-badge">${escapeHtml(status)}</span>`;
}

export function renderPendingChangesList(
  changes: readonly PendingPolicyChangeWithDiff[],
  callerId: string,
): string {
  const rows =
    changes.length === 0
      ? `<tr><td colspan="6" class="empty">No pending policy changes.</td></tr>`
      : changes
          .map(
            (change) => `
    <tr>
      <td><a href="/pending-changes/${escapeHtml(change.pendingPolicyChangeId)}">${escapeHtml(
        change.policyName,
      )}</a></td>
      <td>${escapeHtml(change.policyVersion)}</td>
      <td>${escapeHtml(change.proposedBy)}</td>
      <td>${formatDate(change.proposedAt)}</td>
      <td>${escapeHtml(change.reason)}</td>
      <td>${statusBadge(change.status)}</td>
    </tr>`,
          )
          .join("");

  const body = `
<h2>Pending policy changes</h2>
<table>
  <thead>
    <tr>
      <th>Policy</th>
      <th>Version</th>
      <th>Proposed by</th>
      <th>Proposed at</th>
      <th>Reason</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>`;

  return renderLayout({ title: "Pending changes", callerId, body });
}
