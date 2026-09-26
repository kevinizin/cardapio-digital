/* Servidor só pra testar no computador. NÃO precisa subir pra hospedagem.
   Rode:  node servidor-teste.js     e abra  http://localhost:4173          */

const http = require("http");
const fs = require("fs");
const path = require("path");

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".woff": "font/woff"
};

http.createServer((req, res) => {
  const limpo = decodeURIComponent(req.url.split("?")[0]);
  let alvo = path.join(__dirname, limpo === "/" ? "index.html" : limpo);

  if (!alvo.startsWith(__dirname)) { res.writeHead(403).end("nao"); return; }
  if (fs.existsSync(alvo) && fs.statSync(alvo).isDirectory())
    alvo = path.join(alvo, "index.html");

  fs.readFile(alvo, (erro, dados) => {
    if (erro) { res.writeHead(404, { "Content-Type": "text/plain" }).end("404"); return; }
    res.writeHead(200, {
      "Content-Type": TIPOS[path.extname(alvo).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(dados);
  });
}).listen(4173, () => console.log("http://localhost:4173"));
