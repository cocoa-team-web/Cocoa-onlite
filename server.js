const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT || 8080);
const ROOT = __dirname;
const MAX_PLAYERS = 20;
const WORLD = { width: 2200, height: 1400 };
const players = new Map();
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function publicPlayers() {
  return Array.from(players.values()).map(p => ({
    id: p.id, name: p.name, x: p.x, y: p.y, color: p.color
  }));
}
function broadcast(data, except = null) {
  const payload = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client !== except && client.readyState === WebSocket.OPEN) client.send(payload);
  }
}
function safeName(value) {
  const name = String(value || "Игрок").replace(/[<>]/g, "").trim().slice(0, 18);
  return name || "Игрок";
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({ ok: true, game: "Cocoa Online", players: players.size, maxPlayers: MAX_PLAYERS }));
  }
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.resolve(ROOT, "." + pathname);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== path.join(ROOT, "index.html")) {
    res.writeHead(403); return res.end("Forbidden");
  }
  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); return res.end("Not found"); }
    res.writeHead(200, { "content-type": MIME[path.extname(filePath)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(content);
  });
});

const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 });

wss.on("connection", (ws) => {
  if (players.size >= MAX_PLAYERS) {
    send(ws, { type: "full", message: "Комната заполнена (максимум 20 игроков)." });
    ws.close(1008, "Room full");
    return;
  }

  const id = crypto.randomUUID();
  const palette = ["#ff7b72", "#ffd166", "#7bdff2", "#b2f7ef", "#cdb4db", "#a7c957", "#f4a261"];
  const player = {
    id, name: "Игрок", x: 180 + Math.random() * 1800,
    y: 160 + Math.random() * 1050,
    color: palette[Math.floor(Math.random() * palette.length)],
    lastMoveAt: 0, lastChatAt: 0
  };
  players.set(id, player);
  send(ws, { type: "welcome", id, world: WORLD, players: publicPlayers() });
  broadcast({ type: "join", player: { id, name: player.name, x: player.x, y: player.y, color: player.color } }, ws);

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    const p = players.get(id);
    if (!p || !msg || typeof msg.type !== "string") return;

    if (msg.type === "hello") {
      p.name = safeName(msg.name);
      broadcast({ type: "rename", id: p.id, name: p.name });
    } else if (msg.type === "move") {
      const now = Date.now();
      if (now - p.lastMoveAt < 35) return;
      p.lastMoveAt = now;
      const x = Number(msg.x), y = Number(msg.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      // Basic server-side bounds; movement speed is also limited to reduce obvious teleporting.
      const dx = x - p.x, dy = y - p.y;
      const distance = Math.hypot(dx, dy);
      const maxDistance = 42;
      if (distance > maxDistance) {
        const scale = maxDistance / distance;
        p.x += dx * scale; p.y += dy * scale;
      } else { p.x = x; p.y = y; }
      p.x = Math.max(28, Math.min(WORLD.width - 28, p.x));
      p.y = Math.max(28, Math.min(WORLD.height - 28, p.y));
      broadcast({ type: "move", id: p.id, x: p.x, y: p.y });
    } else if (msg.type === "chat") {
      const now = Date.now();
      if (now - p.lastChatAt < 700) return;
      p.lastChatAt = now;
      const text = String(msg.text || "").replace(/[<>]/g, "").trim().slice(0, 120);
      if (text) broadcast({ type: "chat", id: p.id, name: p.name, text });
    }
  });

  ws.on("close", () => {
    players.delete(id);
    broadcast({ type: "leave", id });
  });
  ws.on("error", () => {});
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Cocoa Online listening on ${PORT}`);
});
