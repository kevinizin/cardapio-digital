/* ==========================================================================
   QR.js — gerador de QR Code próprio (não depende de internet nem de site)
   --------------------------------------------------------------------------
   Implementação do padrão ISO/IEC 18004 em modo byte, versões 1 a 10,
   com correção de erro L/M/Q/H e escolha automática da melhor máscara.
   Não precisa mexer aqui.

   Uso:
     const m = QR.encode("https://...", "Q");     // matriz
     document.body.innerHTML = QR.svg(m, { escala: 8, cor: "#000" });
   ========================================================================== */

const QR = (function () {
"use strict";

/* ---------------------- aritmética de Galois GF(256) ---------------------- */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x; LOG[x] = i;
  x <<= 1; if (x & 0x100) x ^= 0x11D;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

/* --------------------------- tabelas do padrão --------------------------- */
/* total de codewords (dados + correção) por versão */
const TOTAL = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];

/* [codewords de correção por bloco, quantidade de blocos] por versão */
const EC = {
  L: [0, [7,1],[10,1],[15,1],[20,1],[26,1],[18,2],[20,2],[24,2],[30,2],[18,4]],
  M: [0, [10,1],[16,1],[26,1],[18,2],[24,2],[16,4],[18,4],[22,4],[22,5],[26,5]],
  Q: [0, [13,1],[22,1],[18,2],[26,2],[18,4],[24,4],[18,6],[22,6],[20,8],[24,8]],
  H: [0, [17,1],[28,1],[22,2],[16,4],[22,4],[28,4],[26,5],[26,6],[24,8],[28,8]]
};

/* centros dos padrões de alinhamento por versão */
const ALINHA = [null, [], [6,18],[6,22],[6,26],[6,30],[6,34],
                [6,22,38],[6,24,42],[6,26,46],[6,28,50]];

const NIVEL = { L: 1, M: 0, Q: 3, H: 2 };
const N1 = 3, N2 = 3, N3 = 40, N4 = 10;

const dadosCW = (v, ecl) => TOTAL[v] - EC[ecl][v][0] * EC[ecl][v][1];

/* ------------------------- correção de erro (RS) ------------------------- */
function gerador(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const p = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      p[j]     ^= g[j];
      p[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = p;
  }
  return g;
}

function resto(dados, n) {
  const g = gerador(n);
  const r = new Uint8Array(dados.length + n);
  r.set(dados);
  for (let i = 0; i < dados.length; i++) {
    const c = r[i];
    if (!c) continue;
    for (let j = 0; j < g.length; j++) r[i + j] ^= mul(g[j], c);
  }
  return r.slice(dados.length);
}

/* ------------------------------- BCH ------------------------------------- */
function clz(x) { let n = 0; while (x) { x >>>= 1; n++; } return n; }

/* resto polinomial simples, usado no formato e na versão */
function restoBits(valor, gen) {
  const grau = clz(gen) - 1;
  let r = valor << grau;
  for (let i = clz(r) - 1; i >= grau; i--) {
    if ((r >>> i) & 1) r ^= gen << (i - grau);
  }
  return r;
}

/* ============================== CODIFICAÇÃO ============================== */

function encode(texto, nivel) {
  const ecl = NIVEL[nivel] === undefined ? "Q" : nivel;
  const bytes = new TextEncoder().encode(String(texto));

  /* menor versão que cabe */
  let v = 0;
  for (let t = 1; t <= 10; t++) {
    const contador = t < 10 ? 8 : 16;
    if (4 + contador + bytes.length * 8 <= dadosCW(t, ecl) * 8) { v = t; break; }
  }
  if (!v) throw new Error("Texto grande demais para QR versão 10. Use um link mais curto.");

  /* fluxo de bits */
  const bits = [];
  const põe = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  põe(4, 4);                                  // modo byte
  põe(bytes.length, v < 10 ? 8 : 16);
  bytes.forEach(b => põe(b, 8));

  const capacidade = dadosCW(v, ecl) * 8;
  for (let i = 0; i < 4 && bits.length < capacidade; i++) bits.push(0);   // terminador
  while (bits.length % 8) bits.push(0);
  const enche = [0xEC, 0x11];
  for (let i = 0; bits.length < capacidade; i++) põe(enche[i % 2], 8);

  /* bits -> codewords */
  const cw = new Uint8Array(bits.length / 8);
  bits.forEach((b, i) => { if (b) cw[i >>> 3] |= 1 << (7 - (i & 7)); });

  /* divide em blocos, calcula correção e intercala */
  const [ecPorBloco, blocos] = EC[ecl][v];
  const dados = dadosCW(v, ecl);
  const curtos = blocos - (dados % blocos);
  const tamCurto = Math.floor(dados / blocos);

  const partes = [], correcoes = [];
  let p = 0;
  for (let i = 0; i < blocos; i++) {
    const tam = tamCurto + (i < curtos ? 0 : 1);
    const bloco = cw.slice(p, p + tam); p += tam;
    partes.push(bloco);
    correcoes.push(resto(bloco, ecPorBloco));
  }

  const fim = [];
  for (let i = 0; i < tamCurto + 1; i++)
    partes.forEach(b => { if (i < b.length) fim.push(b[i]); });
  for (let i = 0; i < ecPorBloco; i++)
    correcoes.forEach(b => fim.push(b[i]));

  return desenha(v, ecl, new Uint8Array(fim));
}

/* ============================ MONTA A MATRIZ ============================ */

function desenha(v, ecl, dados) {
  const size = 17 + 4 * v;
  const m = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
  const fixo = Array.from({ length: size }, () => new Uint8Array(size));

  const põe = (r, c, val) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    m[r][c] = val ? 1 : 0; fixo[r][c] = 1;
  };

  /* localizadores + separadores */
  [[0,0],[0,size-7],[size-7,0]].forEach(([r0,c0]) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const borda = Math.max(Math.abs(3-r), Math.abs(3-c));
      põe(r0+r, c0+c, r>=0 && r<=6 && c>=0 && c<=6 ? (borda !== 2) : 0);
    }
  });

  /* padrões de tempo */
  for (let i = 8; i < size - 8; i++) { põe(6, i, i % 2 === 0); põe(i, 6, i % 2 === 0); }

  /* alinhamento */
  const cs = ALINHA[v];
  cs.forEach(r0 => cs.forEach(c0 => {
    if ((r0 === 6 && c0 === 6) || (r0 === 6 && c0 === size-7) || (r0 === size-7 && c0 === 6)) return;
    for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++)
      põe(r0+r, c0+c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
  }));

  /* reserva área do formato — pula a linha/coluna 6, que é padrão de tempo */
  for (let i = 0; i < 9; i++) {
    if (i === 6) continue;
    põe(8, i, 0); põe(i, 8, 0);
  }
  for (let i = 0; i < 8; i++) { põe(8, size-1-i, 0); põe(size-1-i, 8, 0); }
  põe(size - 8, 8, 1);                                   // módulo escuro

  /* informação de versão (v >= 7) */
  if (v >= 7) {
    const bits = (v << 12) | restoBits(v, 0x1F25);
    for (let i = 0; i < 18; i++) {
      const b = (bits >>> i) & 1;
      const a = size - 11 + i % 3, x = Math.floor(i / 3);
      põe(x, a, b); põe(a, x, b);
    }
  }

  /* dados em ziguezague */
  let i = 0;
  for (let dir = size - 1; dir >= 1; dir -= 2) {
    if (dir === 6) dir = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const c = dir - j;
        const subindo = ((dir + 1) & 2) === 0;
        const r = subindo ? size - 1 - vert : vert;
        if (!fixo[r][c] && m[r][c] === -1) {
          m[r][c] = i < dados.length * 8 ? (dados[i >>> 3] >>> (7 - (i & 7))) & 1 : 0;
          i++;
        }
      }
    }
  }

  /* escolhe a melhor máscara */
  let melhor = null, notaMelhor = Infinity;
  for (let k = 0; k < 8; k++) {
    const teste = m.map(l => Int8Array.from(l));
    mascara(teste, fixo, k, size);
    formato(teste, ecl, k, size);
    const nota = penalidade(teste, size);
    if (nota < notaMelhor) { notaMelhor = nota; melhor = teste; }
  }

  return {
    size,
    nivel: ecl,
    versao: v,
    get: (r, c) => melhor[r][c] === 1,
    linhas: melhor
  };
}

function mascara(m, fixo, k, size) {
  const f = [
    (r, c) => (r + c) % 2 === 0,
    (r, c) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(c / 3) + Math.floor(r / 2)) % 2 === 0,
    (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
    (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
    (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0
  ][k];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++)
    if (!fixo[r][c] && f(r, c)) m[r][c] ^= 1;
}

function formato(m, ecl, k, size) {
  const dado = (NIVEL[ecl] << 3) | k;
  const bits = ((dado << 10) | restoBits(dado, 0x537)) ^ 0x5412;
  const bit = i => (bits >>> i) & 1;

  for (let i = 0; i <= 5; i++) m[i][8] = bit(i);
  m[7][8] = bit(6);
  m[8][8] = bit(7);
  m[8][7] = bit(8);
  for (let i = 9; i < 15; i++) m[8][14 - i] = bit(i);

  for (let i = 0; i < 8; i++)  m[8][size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) m[size - 15 + i][8] = bit(i);
  m[size - 8][8] = 1;
}

/* --------------------------- nota das máscaras --------------------------- */
function penalidade(m, size) {
  let nota = 0;

  const contaPadroes = h => {
    const n = h[1];
    const nucleo = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
    return (nucleo && h[0] >= n * 4 && h[6] >= n ? 1 : 0) +
           (nucleo && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
  };
  const addHist = (run, h) => {
    if (h[0] === 0) run += size;
    h.copyWithin(1, 0, 6);
    h[0] = run;
  };
  const termina = (cor, run, h) => {
    if (cor) { addHist(run, h); run = 0; }
    addHist(run + size, h);
    return contaPadroes(h);
  };

  /* linhas e colunas */
  for (let modo = 0; modo < 2; modo++) {
    for (let a = 0; a < size; a++) {
      let cor = 0, run = 0;
      const h = new Int32Array(7);
      for (let b = 0; b < size; b++) {
        const val = modo === 0 ? m[a][b] : m[b][a];
        if (val === cor) {
          run++;
          if (run === 5) nota += N1; else if (run > 5) nota++;
        } else {
          addHist(run, h);
          if (!cor) nota += contaPadroes(h) * N3;
          cor = val; run = 1;
        }
      }
      nota += termina(cor, run, h) * N3;
    }
  }

  /* blocos 2x2 da mesma cor */
  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
    const x = m[r][c];
    if (x === m[r][c+1] && x === m[r+1][c] && x === m[r+1][c+1]) nota += N2;
  }

  /* proporção de escuro */
  let escuros = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) escuros += m[r][c];
  const total = size * size;
  const k = Math.ceil((Math.abs(escuros * 20 - total * 10)) / total) - 1;
  nota += Math.max(0, k) * N4;

  return nota;
}

/* ============================== SAÍDAS ============================== */

/* SVG — imprime perfeito em qualquer tamanho */
function svg(qr, o = {}) {
  const zona  = o.zona  == null ? 4 : o.zona;
  const cor   = o.cor   || "#000000";
  const fundo = o.fundo || "#FFFFFF";
  const raio  = o.raio  == null ? 0 : o.raio;      // 0 = quadradinho, .5 = bolinha
  const total = qr.size + zona * 2;
  const furo  = o.furo || 0;                       // módulos vazios no centro (pra logo)
  const ini = Math.floor((qr.size - furo) / 2), fim = ini + furo;

  let partes = "";
  for (let r = 0; r < qr.size; r++) for (let c = 0; c < qr.size; c++) {
    if (!qr.get(r, c)) continue;
    if (furo && r >= ini && r < fim && c >= ini && c < fim) continue;
    const x = c + zona, y = r + zona;
    partes += raio
      ? `<rect x="${x}" y="${y}" width="1" height="1" rx="${raio}"/>`
      : `M${x} ${y}h1v1h-1z`;
  }

  const corpo = raio
    ? `<g fill="${cor}">${partes}</g>`
    : `<path fill="${cor}" d="${partes}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" `
       + `shape-rendering="crispEdges" width="100%" height="100%">`
       + `<rect width="${total}" height="${total}" fill="${fundo}"/>${corpo}</svg>`;
}

/* PNG — pra mandar no WhatsApp, colocar na bio do Instagram, etc. */
function png(qr, o = {}) {
  const zona = o.zona == null ? 4 : o.zona;
  const px   = o.px   || 12;
  const total = (qr.size + zona * 2) * px;
  const cv = document.createElement("canvas");
  cv.width = cv.height = total;
  const g = cv.getContext("2d");
  g.fillStyle = o.fundo || "#FFFFFF";
  g.fillRect(0, 0, total, total);
  g.fillStyle = o.cor || "#000000";
  for (let r = 0; r < qr.size; r++) for (let c = 0; c < qr.size; c++)
    if (qr.get(r, c)) g.fillRect((c + zona) * px, (r + zona) * px, px, px);
  return cv.toDataURL("image/png");
}

return { encode, svg, png };
})();
