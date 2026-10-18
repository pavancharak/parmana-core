import { renderLayout } from "./layout.js";
import { escapeHtml } from "./escapeHtml.js";

export function renderErrorPage(message: string, callerId?: string): string {
  const body = `
<div class="error-banner">${escapeHtml(message)}</div>
<p><a href="/">&larr; Back to pending changes</a></p>`;

  return renderLayout({
    title: "Error",
    body,
    ...(callerId !== undefined ? { callerId } : {}),
  });
}
