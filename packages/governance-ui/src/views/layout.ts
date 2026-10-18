import { escapeHtml } from "./escapeHtml.js";

export interface LayoutOptions {
  readonly title: string;
  readonly callerId?: string;
  readonly body: string;
}

/**
 * Shared HTML shell. Plain inline CSS, no client-side JS anywhere in
 * this package -- see the package README for why.
 */
export function renderLayout(options: LayoutOptions): string {
  const nav =
    options.callerId !== undefined
      ? `<nav>
           <span class="caller">Signed in as <strong>${escapeHtml(options.callerId)}</strong></span>
           <a href="/">Pending changes</a>
           <form method="post" action="/logout" class="logout-form">
             <button type="submit">Log out</button>
           </form>
         </nav>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.title)} - Policy Governance</title>
<style>
  :root {
    color-scheme: light dark;
    --border: #d0d7de;
    --muted: #57606a;
    --bg-subtle: #f6f8fa;
    --accent: #0969da;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    margin: 0;
    padding: 0;
    line-height: 1.5;
  }
  header.banner {
    background: var(--bg-subtle);
    border-bottom: 1px solid var(--border);
    padding: 0.75rem 1.5rem;
  }
  header.banner h1 {
    font-size: 1.1rem;
    margin: 0;
  }
  nav {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 1.5rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.9rem;
  }
  nav .caller { color: var(--muted); margin-right: auto; }
  nav a { color: var(--accent); text-decoration: none; }
  nav a:hover { text-decoration: underline; }
  .logout-form { display: inline; }
  .logout-form button {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font-size: 0.9rem;
    padding: 0;
  }
  main { max-width: 960px; margin: 0 auto; padding: 1.5rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { color: var(--muted); font-weight: 600; font-size: 0.85rem; }
  .empty { color: var(--muted); padding: 2rem 0; text-align: center; }
  .error-banner {
    background: #fff1f0;
    border: 1px solid #ffa39e;
    border-radius: 6px;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
  }
  .status-badge {
    display: inline-block;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    background: var(--bg-subtle);
    border: 1px solid var(--border);
  }
  .diff-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-top: 1rem;
  }
  @media (max-width: 700px) {
    .diff-columns { grid-template-columns: 1fr; }
  }
  .diff-panel {
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  .diff-panel h3 {
    margin: 0;
    padding: 0.5rem 0.75rem;
    background: var(--bg-subtle);
    border-bottom: 1px solid var(--border);
    font-size: 0.9rem;
  }
  .diff-panel pre {
    margin: 0;
    padding: 0.75rem;
    overflow-x: auto;
    font-size: 0.8rem;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .diff-panel.current pre { background: #fff8f8; }
  .diff-panel.proposed pre { background: #f6fff8; }
  .instructions {
    margin-top: 2rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1rem 1.25rem;
    background: var(--bg-subtle);
  }
  .instructions h2 { font-size: 1rem; margin-top: 0; }
  .instructions pre {
    background: #0d1117;
    color: #c9d1d9;
    padding: 0.75rem;
    border-radius: 6px;
    overflow-x: auto;
    font-size: 0.8rem;
  }
  .meta-list { list-style: none; padding: 0; margin: 0.5rem 0 0; }
  .meta-list li { padding: 0.15rem 0; font-size: 0.9rem; }
  .meta-list .label { color: var(--muted); display: inline-block; min-width: 8rem; }
  form.login-form {
    max-width: 360px;
    margin: 3rem auto;
    padding: 1.5rem;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  form.login-form label { display: block; font-size: 0.9rem; margin-bottom: 0.35rem; }
  form.login-form input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    margin-bottom: 1rem;
  }
  form.login-form button {
    width: 100%;
    padding: 0.5rem;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }
</style>
</head>
<body>
<header class="banner">
  <h1>Parmana Policy Governance</h1>
</header>
${nav}
<main>
${options.body}
</main>
</body>
</html>`;
}
