const PING = new TextEncoder().encode(': ping\n\n');

/**
 * Send a server-sent-events comment every few seconds while a streamed AI
 * response is quiet. A model can think for minutes without sending anything,
 * and a proxy such as Cloudflare drops a connection that is silent for 100
 * seconds. Clients ignore comment lines.
 */
export function withKeepAlive(response: Response, intervalMs = 15_000): Response {
  const body = response.body;
  if (!body) return response;

  const reader = body.getReader();
  let timer: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      timer = setInterval(() => controller.enqueue(PING), intervalMs);
      (async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          clearInterval(timer);
          controller.close();
        } catch (error) {
          clearInterval(timer);
          controller.error(error);
        }
      })();
    },
    cancel(reason) {
      clearInterval(timer);
      return reader.cancel(reason);
    },
  });

  return new Response(stream, { status: response.status, headers: response.headers });
}
