/**
 * Escapes the characters MDX would parse as JSX or expressions in the
 * generated Python SDK reference, leaving fenced code and frontmatter alone.
 *
 * A backslash that already escapes an ASCII punctuation character (pydoc's
 * own `\_`, `\*`, `\{`) is left as it is. Any other backslash is literal text,
 * so it is doubled; otherwise the next character could be read as an escape.
 */

/**
 * One pass over a line, so each character is decided once and an escape
 * added here is never escaped again. Alternatives, in order: a backslash
 * already escaping ASCII punctuation (kept), a lone backslash (doubled),
 * a brace (escaped), and a `<` that opens a tag (entity-encoded).
 */
const UNSAFE =
  /\\[\x21-\x2F\x3A-\x40\x5B-\x60\x7B-\x7E]|\\|[{}]|<(?=[A-Za-z/])/g;

function escapeUnsafe(match: string): string {
  if (match.length === 2) return match;
  if (match === "\\") return "\\\\";
  if (match === "<") return "&lt;";
  return "\\" + match;
}

export function escapeMdxUnsafeCharacters(text: string): string {
  let inCodeFence = false;
  let inFrontmatter = false;

  return text
    .split("\n")
    .map((line, index) => {
      if (index === 0 && line.trim() === "---") {
        inFrontmatter = true;
        return line;
      }
      if (inFrontmatter) {
        if (line.trim() === "---") inFrontmatter = false;
        return line;
      }

      if (line.trimStart().startsWith("```")) {
        inCodeFence = !inCodeFence;
        return line;
      }

      if (inCodeFence) return line;

      /**
       * `<a id="...">...</a>` is pydoc-markdown's own generated anchor,
       * a real, already-valid HTML tag MDX renders as-is -- left alone.
       */
      if (/^\s*<a id="/.test(line)) return line;

      return line.replace(UNSAFE, escapeUnsafe);
    })
    .join("\n");
}
