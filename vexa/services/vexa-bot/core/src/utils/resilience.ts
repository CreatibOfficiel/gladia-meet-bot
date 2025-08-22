/**
 * Wait for a given number of milliseconds.
 * @param ms - Milliseconds to wait.
 */
function sleepUntil(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries an async action up to a given number of attempts, waiting between each attempt.
 * The wait happens after failure, except after the last attempt.
 * 
 * @param actionName - Reference this in logging and debugging
 * @param action - The flaky async function to execute. Ensure this function can either resolve or reject.
 * @param attempts - How many times to try the action.
 * @param waitMs - How long to wait between attempts (in milliseconds).
 * @param onError - Optional callback to execute on error (e.g., take screenshot).
 * @returns The result of the action if successful; throws last error if all attempts fail.
 */
export async function retryActionWithWait<T>(
  actionName: string,
  action: () => Promise<T>,
  attempts: number = 3,
  waitMs: number = 20000,
  onError?: () => Promise<void>
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await action();
      return result;
    } catch (err) {
      lastError = err;
      console.warn(`Retry ${attempt} on "${actionName}" action`);
      if (attempt < attempts) {
        await sleepUntil(waitMs);
      }
    }
  }
  if (typeof onError === 'function') {
    await onError();
  }
  console.error(`Unable to complete the "${actionName}" action after ${attempts} attempts`);
  throw lastError;
}