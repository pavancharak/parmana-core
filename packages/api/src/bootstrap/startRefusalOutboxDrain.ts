/** The outbox drain, as the server uses it. */
export interface RefusalOutboxDrainer {
  drainRefusalOutbox(
    limit?: number,
  ): Promise<{ delivered: number; failed: number }>;
}

/**
 * How often the refusal outbox is drained, in seconds, from
 * PARMANA_REFUSAL_OUTBOX_SECONDS. Unset means 30. Must be a whole number from
 * 1 to 86400.
 */
export function refusalOutboxSecondsFrom(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.PARMANA_REFUSAL_OUTBOX_SECONDS;

  if (raw === undefined || raw.trim() === "") {
    return 30;
  }

  const seconds = Number(raw);

  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 86_400) {
    throw new Error(
      `PARMANA_REFUSAL_OUTBOX_SECONDS must be a whole number from 1 to 86400, got "${raw}".`,
    );
  }

  return seconds;
}

/**
 * Starts the timer that writes the Refusal Records still pending in the
 * outbox (RFC-0021). A run that is still going when the next tick comes is
 * skipped, so runs never overlap. The timer is unref'd so it does not keep the
 * process alive; the caller clears it on shutdown.
 */
export function startRefusalOutboxDrain(
  app: RefusalOutboxDrainer,
  env: NodeJS.ProcessEnv = process.env,
  onError: (error: unknown) => void = (error) => {
    console.error("Refusal outbox drain failed.", error);
  },
): ReturnType<typeof setInterval> {
  const seconds = refusalOutboxSecondsFrom(env);
  let running = false;

  const timer = setInterval(() => {
    if (running) return;

    running = true;
    app
      .drainRefusalOutbox()
      .then((result) => {
        if (result.failed > 0) {
          console.error({
            event: "refusal_outbox_drain_partial",
            delivered: result.delivered,
            failed: result.failed,
          });
        }
      })
      .catch(onError)
      .finally(() => {
        running = false;
      });
  }, seconds * 1000);

  timer.unref?.();

  return timer;
}
