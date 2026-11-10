/**
 * Removes secrets from anything the CLI prints. Used for verbose logs, dry-run
 * output and error text, so none of them can leak a token or a signature.
 */
export function redactText(
  text: string,
  secrets: readonly string[] = [],
): string {
  let out = text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer ***");
  out = out.replace(/"signature"\s*:\s*"[^"]*"/g, '"signature":"***"');
  for (const secret of secrets) {
    if (secret.length > 0) {
      out = out.split(secret).join("***");
    }
  }
  return out;
}
