/**
 * Pretty-print a titled object to the console.
 *
 * @param title Section title.
 * @param value Value to print.
 */
export function print(title: string, value: unknown): void {
  console.log();
  console.log("========================================");
  console.log(` ${title}`);
  console.log("========================================");
  console.log();

  console.log(JSON.stringify(value, null, 2));
}

/**
 * Print a section heading.
 *
 * @param title Section title.
 */
export function printHeading(title: string): void {
  console.log();
  console.log("========================================");
  console.log(` ${title}`);
  console.log("========================================");
  console.log();
}

/**
 * Print a simple message.
 *
 * @param message Message to print.
 */
export function printMessage(message: string): void {
  console.log(message);
}

/**
 * Print a workflow step.
 *
 * @param step Step number.
 * @param title Step title.
 */
export function printStep(step: number, title: string): void {
  console.log();
  console.log(`Step ${step} - ${title}`);
  console.log();
}
