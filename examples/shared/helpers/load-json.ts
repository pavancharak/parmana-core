import { readFile } from "node:fs/promises";

/**
 * Load and parse a JSON file.
 *
 * @param filePath Path to a JSON file.
 * @returns Parsed JSON object.
 */
export async function loadJson<T>(filePath: string): Promise<T> {
  const text = await readFile(filePath, "utf8");

  return JSON.parse(text) as T;
}
