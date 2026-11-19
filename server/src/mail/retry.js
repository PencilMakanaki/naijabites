/** Wait before retrying a failed email: 1 min, 5 min, 15 min, then 1 hour. */
export function retryDelayMs(attempts) {
  const minutes = [1, 5, 15, 60][Math.min(Math.max(attempts, 1), 4) - 1];
  return minutes * 60 * 1000;
}
