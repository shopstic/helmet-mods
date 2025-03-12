import type { EC2ClientConfig } from "@aws-sdk/client-ec2";
import { EC2Client } from "@aws-sdk/client-ec2";
import { AsyncQueue } from "@wok/utils/async-queue";
import type { Logger } from "@wok/utils/logger";
import { delay } from "@std/async/delay";
import { promiseWithAbortableTimeout } from "@wok/utils/async";
import { useDependentAbortController } from "@wok/utils/disposable";

export function useEc2Client(config: EC2ClientConfig, {
  concurrency,
  sendTimeoutSeconds = 15,
  rateLimit,
  logger,
}: {
  concurrency: number;
  rateLimit: {
    count: number;
    perDurationMs: number;
    onErrorBackoffMs: () => number;
  };
  sendTimeoutSeconds?: number;
  logger: Logger;
}) {
  const ac = new AbortController();
  const ec2Client = new EC2Client(config);
  const sendQueue = new AsyncQueue<{
    deferred: PromiseWithResolvers<unknown>;
    command: Parameters<typeof ec2Client.send>[0];
    options: Parameters<typeof ec2Client.send>[1] | undefined;
  }>(10);

  const dequeuePromise = (async () => {
    for await (
      const _ of sendQueue
        .throttle(rateLimit.count, rateLimit.perDurationMs)
        .concurrentMap(concurrency, async ({ deferred, command, options }) => {
          while (true) {
            try {
              const result = await promiseWithAbortableTimeout(
                sendTimeoutSeconds * 1000,
                async (timeoutSignal) => {
                  using udac = useDependentAbortController(
                    ac.signal,
                    timeoutSignal,
                    options?.abortSignal as (AbortSignal | undefined),
                  );
                  return await ec2Client.send(command, { ...options, abortSignal: udac.abortController.signal });
                },
                () => {
                  const msg = `Timed out waiting for ec2Client result for command: ${command.constructor.name}`;
                  logger.error?.(msg);
                  return new Error(msg);
                },
              );
              return deferred.resolve(result);
            } catch (e) {
              if (
                typeof e === "object" && e !== null && "syscall" in e && e.syscall === "getaddrinfo" &&
                "hostname" in e && typeof e.hostname === "string" && e.hostname.endsWith(".amazonaws.com")
              ) {
                logger.warn?.("got DNS resolution error, will retry");
                await delay(100, { signal: ac.signal });
              } else if (typeof e === "object" && e !== null && "Code" in e && e.Code === "RequestLimitExceeded") {
                const backoffMs = rateLimit.onErrorBackoffMs();
                logger.warn?.(
                  "got RequestLimitExceeded error for command:",
                  command.constructor.name,
                  "will retry in",
                  backoffMs,
                  "ms",
                );
                await delay(backoffMs, { signal: ac.signal });
              } else {
                return deferred.reject(e);
              }
            }
          }
        })
    ) {
      // Just dequeuing
    }
  })();

  const throttledEc2Client = {
    async send(command, options) {
      const deferred = Promise.withResolvers<unknown>();
      await sendQueue.enqueue({
        deferred,
        // deno-lint-ignore no-explicit-any
        command: command as any,
        // deno-lint-ignore no-explicit-any
        options: options as any,
      });
      return await deferred.promise;
    },
    get config() {
      return ec2Client.config;
    },
    get middlewareStack() {
      return ec2Client.middlewareStack;
    },
    destroy() {
      sendQueue.complete();
      ec2Client.destroy();
    },
  } satisfies typeof ec2Client;

  return {
    ec2Client: throttledEc2Client,
    async [Symbol.asyncDispose]() {
      ac.abort();
      throttledEc2Client.destroy();
      await dequeuePromise;
    },
  };
}
