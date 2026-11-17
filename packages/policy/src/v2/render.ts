/**
 * Renders the governance console's screens as HTML (governance design, sections 3 and 6).
 *
 * Plain HTML from the console's data. No framework, no server, no scripts. Access
 * is checked by the console functions this calls, so a role that may not open a
 * screen gets an error and no HTML. The screens show what each role may see, and
 * they do not contain buttons that change anything: acting on an item needs
 * endpoints that are not built yet.
 *
 * Every value is escaped. An alert is shown in full, has no close control, and
 * stays at the top of every screen while it is open.
 */

import type { Alert } from "./alerts.js";
import {
  auditScreen,
  requireScreen,
  changesScreen,
  decisionsScreen,
  gateScreen,
  homeScreen,
  registerScreen,
  reviewsScreen,
  type ConsoleSources,
  type Screen,
  type Viewer,
} from "./console.js";

export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The open alerts for a viewer, shown in full. There is no close or snooze control. */
function alertBar(alerts: readonly Alert[]): string {
  if (alerts.length === 0) return "";
  const items = alerts
    .map(
      (a) => `<article class="alert" data-alert="${escapeHtml(a.id)}">
  <h2>${escapeHtml(a.kind)}: ${escapeHtml(a.ref)}</h2>
  <p>${escapeHtml(a.explanation)}</p>
  <p><strong>If nothing is done:</strong> ${escapeHtml(a.consequence)}</p>
  <p><strong>Next step:</strong> ${escapeHtml(a.steps[a.stepIndex] ?? a.steps[a.steps.length - 1] ?? "")} (step ${a.stepIndex + 1} of ${a.steps.length})</p>
  <p>Deadline: ${escapeHtml(a.deadline)}. Help: ${escapeHtml(a.helpRef)}</p>
</article>`,
    )
    .join("\n");
  return `<section class="alerts" aria-live="assertive">
<p>${alerts.length} open alert(s). They stay here until their task is complete.</p>
${items}
</section>`;
}

function table(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body =
    rows.length === 0
      ? `<tr><td colspan="${headers.length}">Nothing here.</td></tr>`
      : rows
          .map(
            (r) =>
              `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`,
          )
          .join("\n");
  return `<table><thead><tr>${head}</tr></thead><tbody>\n${body}\n</tbody></table>`;
}

function page(
  title: string,
  viewer: Viewer,
  alerts: readonly Alert[],
  body: string,
): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body>
<header><p>Signed in as ${escapeHtml(viewer.id)} (${escapeHtml(viewer.roles.join(", ") || "no role")})</p></header>
${alertBar(alerts)}
<main>
<h1>${escapeHtml(title)}</h1>
${body}
</main>
</body>
</html>`;
}

/** Renders one screen for a viewer. Throws if the viewer may not open it. */
export function renderScreen(
  screen: Screen,
  viewer: Viewer,
  src: ConsoleSources,
  options: {
    capability?: string;
    usedSources?: readonly string[];
    usedThresholds?: readonly string[];
  } = {},
): string {
  requireScreen(viewer, screen);
  const alerts = src.alerts.visibleFor({ id: viewer.id, roles: viewer.roles });
  switch (screen) {
    case "home": {
      const home = homeScreen(viewer, src);
      const body = `<h2>Blocked</h2>${table(
        ["Action", "Missing"],
        home.blocked.map((b) => [
          b.capability,
          b.missing.join("; ") || "nothing",
        ]),
      )}
<h2>Reviews you can decide</h2>${table(
        ["Item", "Target", "Due"],
        home.reviews.map((r) => [r.id, r.target, r.dueAt]),
      )}
<h2>Changes awaiting approval</h2>${table(
        ["Kind", "Name", "Awaiting"],
        home.changes.map((c) => [c.kind, c.name, c.awaiting.join("; ")]),
      )}`;
      return page("Home", viewer, alerts, body);
    }
    case "register": {
      const reg = registerScreen(viewer, src);
      const body = `<h2>Sources</h2>${table(
        ["Name", "Data owner", "Signer", "Status"],
        reg.sources.map((s) => [s.name, s.dataOwner, s.signer.kind, s.status]),
      )}
<h2>Thresholds</h2>${table(
        ["Threshold", "Value", "Status"],
        reg.thresholds.map((t) => [
          `${t.action}/${t.name}`,
          `${t.value} ${t.unit}`,
          t.status,
        ]),
      )}
<h2>Actions</h2>${table(
        ["Capability", "Owner", "Live"],
        reg.actions.map((a) => [a.capability, a.owner, a.live ? "yes" : "no"]),
      )}`;
      return page("Register", viewer, alerts, body);
    }
    case "changes": {
      const rows = changesScreen(viewer, src);
      return page(
        "Changes",
        viewer,
        alerts,
        table(
          ["Kind", "Name", "Proposed by", "Awaiting"],
          rows.map((c) => [
            c.kind,
            c.name,
            c.proposedBy,
            c.awaiting.join("; ") || "nothing",
          ]),
        ),
      );
    }
    case "reviews": {
      const rows = reviewsScreen(viewer, src);
      const body = table(
        [
          "Item",
          "Capability",
          "Target",
          "Status",
          "Due",
          "High value",
          "You can decide",
        ],
        rows.map((r) => [
          r.id,
          r.capability,
          r.target,
          r.status,
          r.dueAt,
          r.highValue ? "yes" : "no",
          r.canDecide ? "yes" : "no",
        ]),
      );
      return page("Reviews", viewer, alerts, body);
    }
    case "approvals":
      return page(
        "Approvals",
        viewer,
        alerts,
        "<p>Approvals are signed in the approval tool. This screen lists the requests waiting for your confirmation once that list is wired in.</p>",
      );
    case "gate": {
      if (options.capability === undefined)
        throw new Error("The gate screen needs the action's capability.");
      const rows = gateScreen(
        viewer,
        src,
        options.capability,
        options.usedSources ?? [],
        options.usedThresholds ?? [],
      );
      return page(
        "Go-live checklist",
        viewer,
        alerts,
        table(
          ["Item", "Done"],
          rows.map((r) => [r.item, r.done ? "yes" : "no"]),
        ),
      );
    }
    case "decisions": {
      const rows = decisionsScreen(viewer, src);
      return page(
        "Decisions",
        viewer,
        alerts,
        table(
          [
            "Recorded",
            "Capability",
            "Target",
            "Outcome",
            "Rule",
            "Tier",
            "Policy hash",
          ],
          rows.map((r) => [
            r.decidedAt,
            r.capability,
            r.target,
            r.outcome,
            r.matchedRuleId ?? "",
            r.tier ?? "",
            r.policyHash,
          ]),
        ),
      );
    }
    case "audit": {
      const rows = auditScreen(viewer, src);
      return page(
        "Audit",
        viewer,
        alerts,
        table(
          ["At", "By", "Event", "Detail"],
          rows.map((e) => [e.at, e.by, e.event, e.detail]),
        ),
      );
    }
  }
}
