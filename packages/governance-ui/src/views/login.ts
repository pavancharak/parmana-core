import { renderLayout } from "./layout.js";
import { escapeHtml } from "./escapeHtml.js";

export function renderLoginPage(errorMessage?: string): string {
  const errorBanner =
    errorMessage !== undefined
      ? `<div class="error-banner">${escapeHtml(errorMessage)}</div>`
      : "";

  const body = `
${errorBanner}
<form class="login-form" method="post" action="/login">
  <label for="apiKey">Parmana API key</label>
  <input type="password" id="apiKey" name="apiKey" autocomplete="off" required autofocus>
  <button type="submit">Sign in</button>
</form>
<p style="text-align:center; color:#57606a; font-size:0.85rem;">
  Your key is validated against the Parmana API and kept server-side only
  for this session -- it is never sent to your browser.
</p>`;

  return renderLayout({ title: "Sign in", body });
}
