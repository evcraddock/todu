import { once } from "node:events";
import net from "node:net";
import { WebSocket } from "ws";
import { createTodu } from "../../packages/engine/src/index.js";
import type { Todu } from "../../packages/engine/src/todu.js";

export async function reserveTcpPort(): Promise<number> {
  const listener = net.createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Missing test TCP address");
  await new Promise<void>((resolve, reject) => {
    listener.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

export async function startTestSyncServer(storagePath: string): Promise<{
  server: Todu;
  port: number;
  url: string;
}> {
  const port = await reserveTcpPort();
  const server = await createTodu({ storagePath, syncServer: true, syncPort: port });
  const url = `ws://127.0.0.1:${port}`;
  const socket = new WebSocket(url);
  try {
    await once(socket, "open");
    const closed = once(socket, "close");
    socket.close();
    await closed;
    return { server, port, url };
  } catch (error) {
    socket.terminate();
    await server.close();
    throw error;
  }
}
