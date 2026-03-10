function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createRequestLimiter({
  enabled,
  maxConcurrency,
  delayMs,
  backoffBaseMs,
  backoffFactor,
  failureThreshold,
  circuitOpenMs,
}) {
  if (!enabled) {
    // No-op implementation when throttling is disabled
    return {
      schedule: async (_url, fn) => fn(),
    };
  }

  const queue = [];
  let active = 0;

  const perHost = new Map();

  function getHostState(host) {
    if (!perHost.has(host)) {
      perHost.set(host, {
        lastRequestStart: 0,
        consecutiveFailures: 0,
        circuitState: 'closed', // 'closed' | 'open' | 'half-open'
        circuitOpenedAt: 0,
      });
    }
    return perHost.get(host);
  }

  async function runTask(task) {
    active += 1;
    try {
      await task();
    } finally {
      active -= 1;
      if (queue.length > 0) {
        const next = queue.shift();
        // Fire and forget; errors handled inside the task promise
        runTask(next);
      }
    }
  }

  async function schedule(url, fn) {
    const host = new URL(url).host;
    const state = getHostState(host);

    return new Promise((resolve, reject) => {
      const task = async () => {
        const now = Date.now();

        // Circuit breaker checks
        if (state.circuitState === 'open') {
          const elapsed = now - state.circuitOpenedAt;
          if (elapsed < circuitOpenMs) {
            console.log(
              `[requestLimiter] Circuit open for host=${host}, skipping request`
            );
            reject(
              new Error(
                `Circuit open for host ${host}, skipping request (wait ${
                  circuitOpenMs - elapsed
                }ms)`
              )
            );
            return;
          }
          // Move to half-open after open window passes
          state.circuitState = 'half-open';
        }

        // Per-host minimum delay between request starts
        const sinceLastStart = now - state.lastRequestStart;
        if (sinceLastStart < delayMs) {
          const wait = delayMs - sinceLastStart;
          console.log(
            `[requestLimiter] Delay ${wait}ms before request to host=${host}`
          );
          await sleep(wait);
        }

        // Exponential backoff based on consecutive failures
        if (state.consecutiveFailures > 0) {
          const factorPower = state.consecutiveFailures - 1;
          const backoffDelay = Math.min(
            backoffBaseMs * Math.pow(backoffFactor, factorPower),
            30000
          );
          console.log(
            `[requestLimiter] Backoff ${backoffDelay}ms for host=${host}, failures=${state.consecutiveFailures}`
          );
          await sleep(backoffDelay);
        }

        state.lastRequestStart = Date.now();

        try {
          const result = await fn();

          // Success resets failures and potentially closes circuit
          state.consecutiveFailures = 0;
          if (state.circuitState !== 'closed') {
            console.log(
              `[requestLimiter] Circuit closed for host=${host} after successful request`
            );
            state.circuitState = 'closed';
            state.circuitOpenedAt = 0;
          }

          resolve(result);
        } catch (err) {
          state.consecutiveFailures += 1;

          console.log(
            `[requestLimiter] Request failed for host=${host}, consecutiveFailures=${state.consecutiveFailures}: ${err.message}`
          );

          if (
            state.circuitState === 'closed' &&
            state.consecutiveFailures >= failureThreshold
          ) {
            state.circuitState = 'open';
            state.circuitOpenedAt = Date.now();
            console.log(
              `[requestLimiter] Circuit opened for host=${host} after ${state.consecutiveFailures} failures`
            );
          } else if (state.circuitState === 'half-open') {
            state.circuitState = 'open';
            state.circuitOpenedAt = Date.now();
            console.log(
              `[requestLimiter] Circuit re-opened for host=${host} after half-open failure`
            );
          }

          reject(err);
        }
      };

      if (active >= maxConcurrency) {
        queue.push(task);
      } else {
        runTask(task);
      }
    });
  }

  return { schedule };
}

module.exports = { createRequestLimiter };

