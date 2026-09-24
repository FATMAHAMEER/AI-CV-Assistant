import { createReadStream } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";

const root = process.cwd();
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = normalize(join(root, relative));
  if (!file.startsWith(root)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  const stream = createReadStream(file);
  stream.on("open", () => response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" }));
  stream.on("error", () => response.writeHead(404).end("Not found"));
  stream.pipe(response);
}).listen(8000, "127.0.0.1", () => console.log("AI CV Assistant: http://127.0.0.1:8000"));
