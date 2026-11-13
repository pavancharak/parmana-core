// A TCP proxy between the API and Postgres, for the outage drill.
//
//   LISTEN_PORT   the port the API connects to
//   TARGET_PORT   the Postgres port behind it
//   CONTROL_PORT  HTTP control port on 127.0.0.1:
//                 POST /cut   stop accepting and drop live connections
//                 POST /heal  accept connections again
import http from "node:http";
import net from "node:net";

const listenPort = Number(process.env.LISTEN_PORT);
const targetPort = Number(process.env.TARGET_PORT);
const controlPort = Number(process.env.CONTROL_PORT);

let cut = false;
const sockets = new Set();

const server = net.createServer((client) => {
  if (cut) {
    client.destroy();
    return;
  }

  const upstream = net.connect(targetPort, "127.0.0.1");
  sockets.add(client);
  sockets.add(upstream);

  const drop = () => {
    client.destroy();
    upstream.destroy();
    sockets.delete(client);
    sockets.delete(upstream);
  };

  client.on("error", drop);
  upstream.on("error", drop);
  client.on("close", drop);
  upstream.on("close", drop);
  client.pipe(upstream);
  upstream.pipe(client);
});

server.listen(listenPort, "127.0.0.1");

http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url === "/cut") {
      cut = true;

      for (const socket of sockets) {
        socket.destroy();
      }

      sockets.clear();
      res.end("cut\n");
      return;
    }

    if (req.method === "POST" && req.url === "/heal") {
      cut = false;
      res.end("healed\n");
      return;
    }

    res.statusCode = 404;
    res.end();
  })
  .listen(controlPort, "127.0.0.1");

console.log(`proxy ${listenPort} -> ${targetPort}, control ${controlPort}`);
