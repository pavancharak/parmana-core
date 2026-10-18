/**
 * Every dynamic value rendered by this package's views MUST pass
 * through this before being embedded in an HTML template-literal
 * string -- there is no templating engine here doing auto-escaping,
 * and several of the values rendered (a proposal's `reason`, a
 * proposer's callerId, policy content) are supplied by an
 * authenticated but otherwise untrusted human maker, then displayed
 * to a different human checker. Skipping this on any one field is a
 * stored-XSS hole into an internal governance tool.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Pretty-prints an arbitrary JSON value and escapes it for safe
 * embedding inside a <pre> block.
 */
export function escapedJson(value: unknown): string {
  return escapeHtml(JSON.stringify(value, null, 2));
}
