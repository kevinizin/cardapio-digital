/* ==========================================================================
   CARDÁPIO DIGITAL — MOTOR
   --------------------------------------------------------------------------
   NÃO PRECISA MEXER NESTE ARQUIVO. Tudo o que muda de cliente pra cliente
   está no config.js.
   ========================================================================== */

(function () {
"use strict";

/* ------------------------------- atalhos ------------------------------- */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const brl = n => "R$ " + Number(n).toFixed(2).replace(".", ",");
const esc = s => String(s).replace(/[&<>"]/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;


/* ==========================================================================
   1 · TEMA — pinta o site com a paleta escolhida
   ========================================================================== */

const hexRGB = h => {
  let x = String(h).replace("#", "").trim();
  if (x.length === 3) x = [...x].map(c => c + c).join("");
  const v = parseInt(x, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/* Texto preto ou branco sobre a cor da marca. Não usa "chute" de limiar:
   calcula o contraste real das duas opções (WCAG) e fica com a maior.
   Isso importa em cores de brilho médio — dourado envelhecido, laranja,
   rosa — onde um limiar fixo erra e devolve texto quase ilegível. */
const luminancia = hex => {
  const [r, g, b] = hexRGB(hex).map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const textoSobre = hex => {
  const L = luminancia(hex);
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? "#100C08" : "#FFFFFF";
};

function aplicaTema(nome) {
  const p = typeof nome === "object" ? nome : (PALETAS[nome] || PALETAS.brasa);
  const raiz = document.documentElement;
  const v = {
    "--fundo": p.fundo, "--caixa": p.caixa, "--caixa2": p.caixa2, "--linha": p.linha,
    "--txt": p.texto, "--txt2": p.texto2,
    "--marca": p.marca, "--marca-rgb": hexRGB(p.marca).join(","),
    "--marca-txt": textoSobre(p.marca),
    "--marca2": p.marca2, "--marca2-rgb": hexRGB(p.marca2).join(","),
    "--zap": p.zap || "#22C55E",
    "--zap-txt": textoSobre(p.zap || "#22C55E"),
    "--f-display": FONTES.display, "--f-txt": FONTES.texto,
    "--f-display-peso": FONTES.peso || 400
  };
  for (const k in v) raiz.style.setProperty(k, v[k]);
  raiz.dataset.claro = p.claro ? "1" : "0";

  let meta = $('meta[name="theme-color"]');
  if (!meta) { meta = el("meta"); meta.name = "theme-color"; document.head.appendChild(meta); }
  meta.content = p.fundo;
}

function carregaFontes() {
  if (!FONTES.google) return;
  const pre = el("link"); pre.rel = "preconnect"; pre.href = "https://fonts.gstatic.com";
  pre.crossOrigin = ""; document.head.appendChild(pre);
  const f = el("link"); f.rel = "stylesheet";
  f.href = `https://fonts.googleapis.com/css2?family=${FONTES.google}&display=swap`;
  document.head.appendChild(f);
}

aplicaTema(TEMA);
carregaFontes();


/* ==========================================================================
   2 · MARCA — logo (ou monograma), nomes, links
   ========================================================================== */

const iniciais = LOJA.nome.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/)
  .filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "🍔";

/* Como o cliente chegou? É isso que define a versão do cardápio.

     meusite.com            → link normal (Instagram, Google): versão ENTREGA
     meusite.com/?mesa=5    → QR da mesa 5:      versão NO LOCAL, com o número
     meusite.com/?local=1   → QR sem numeração:  versão NO LOCAL, sem número   */
const BUSCA = new URLSearchParams(location.search);

const MESA = (BUSCA.get("mesa") || "")
  .replace(/[^\p{L}\p{N}\-]/gu, "").slice(0, 6);

/* qualquer QR do estabelecimento cai na versão de salão, com ou sem mesa */
const NO_LOCAL = BUSCA.has("local") || BUSCA.has("mesa");

const logoHTML = () => LOJA.logo
  ? `<img src="${esc(LOJA.logo)}" alt="${esc(LOJA.nome)}" width="200" height="200">`
  : `<span class="mono">${esc(iniciais)}</span>`;

["#logoTop", "#logoCapa", "#logoPe"].forEach(s => { const n = $(s); if (n) n.innerHTML = logoHTML(); });

$("#nomeTop").textContent   = LOJA.nome;
$("#sloganTop").textContent = LOJA.slogan || "";
$("#nomePe").textContent    = LOJA.nome;
$("#tagPe").textContent     = [LOJA.slogan, LOJA.cidade].filter(Boolean).join(" · ");
$("#pinTxt").textContent    = NO_LOCAL
  ? (MESA ? `Mesa ${MESA} · ${LOJA.nome}` : `Pedido no local · ${LOJA.nome}`)
  : (LOJA.cidade || LOJA.nome);

/* selinho no topo, pro cliente ver que leu o QR certo */
if (NO_LOCAL) {
  const tag = el("span", "status mesa",
    `<i></i>${MESA ? "Mesa " + esc(MESA) : "No local"}`);
  $(".hdr-r").prepend(tag);
}

/* favicon com o emoji da loja */
(function () {
  const ic = el("link"); ic.rel = "icon";
  ic.href = "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${LOJA.emoji || "🍔"}</text></svg>`);
  document.head.appendChild(ic);
})();

/* capa */
(function () {
  const t = $("#capaTitulo");
  t.innerHTML = esc(CAPA.titulo).replace(/\*(.+?)\*/g, "<span>$1</span>");
  $("#capaSub").textContent = CAPA.sub || "";

  const bg = $("#capaBg");
  if (CAPA.imagem) {
    bg.className = "capa-bg foto";
    bg.style.backgroundImage = `url("${CAPA.imagem}")`;
    document.querySelector(".capa").classList.add("tem-foto");
  } else {
    bg.className = "capa-bg grafico";
  }

  const f = $("#faixa");
  const selos = (CAPA.selos || []).map(s => `<span>${esc(s)}</span>`).join("");
  f.innerHTML = selos + selos;          // duplicado pro loop ficar contínuo
})();

/* links de WhatsApp soltos (topo, capa, info).
   Na versão de salão eles já vão identificados, pra nunca chegar um
   "quero fazer um pedido" solto sem ninguém saber de que mesa é. */
const zapURL = txt => `https://wa.me/${LOJA.whatsapp}?text=${encodeURIComponent(txt)}`;
$$(".zap-link").forEach(a => {
  a.href = zapURL(NO_LOCAL
    ? `Olá! Estou ${MESA ? "na Mesa " + MESA : "no local"} do ${LOJA.nome} e preciso de ajuda 🙋`
    : `Olá! Vi o cardápio do ${LOJA.nome} e quero fazer um pedido ${LOJA.emoji || "🍔"}`);
});

/* no salão o botão "Pedir" do topo dá lugar ao selo da mesa: o pedido tem
   que sair pelo carrinho, que é o único caminho que carrega a mesa junto */
if (NO_LOCAL) {
  const zapTopo = $(".hdr-r .zap-btn");
  if (zapTopo) zapTopo.hidden = true;
}


/* ==========================================================================
   3 · HORÁRIO — abre e fecha sozinho
   ========================================================================== */

const DIAS  = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const NOMES = { dom: "domingo", seg: "segunda", ter: "terça", qua: "quarta",
                qui: "quinta", sex: "sexta", sab: "sábado" };
const min = hhmm => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + (m || 0); };

function status(agora = new Date()) {
  const d = agora.getDay();
  const t = agora.getHours() * 60 + agora.getMinutes();

  if (FORCAR === true)  return { aberto: true };
  if (FORCAR === false) return { aberto: false, abre: null };

  /* sessão de ontem que atravessou a meia-noite */
  const ontem = HORARIOS[DIAS[(d + 6) % 7]];
  if (ontem) {
    const [i, f] = ontem.map(min);
    if (f <= i && t < f) return { aberto: true, fecha: ontem[1] };
  }

  const hoje = HORARIOS[DIAS[d]];
  if (hoje) {
    const [i, f] = hoje.map(min);
    const fim = f <= i ? f + 1440 : f;
    if (t >= i && t < fim) return { aberto: true, fecha: hoje[1] };
    if (t < i)             return { aberto: false, abre: hoje[0], quando: "hoje" };
  }

  for (let k = 1; k <= 7; k++) {
    const dia = DIAS[(d + k) % 7];
    if (HORARIOS[dia]) {
      return { aberto: false, abre: HORARIOS[dia][0],
               quando: k === 1 ? "amanhã" : NOMES[dia] };
    }
  }
  return { aberto: false, abre: null };
}

let ST = status();

function pintaStatus() {
  ST = status();
  const n = $("#statusTop");
  n.hidden = false;
  n.className = "status " + (ST.aberto ? "on" : "off");
  n.innerHTML = ST.aberto
    ? `<i></i>Aberto agora`
    : `<i></i>Fechado`;
  n.title = ST.aberto
    ? (ST.fecha ? "Fecha às " + ST.fecha : "Aberto")
    : (ST.abre ? `Abre ${ST.quando} às ${ST.abre}` : "Fechado");
}
pintaStatus();
setInterval(pintaStatus, 60000);

/* lista de horários na seção info */
(function () {
  const ul = $("#horasLista");
  const hoje = DIAS[new Date().getDay()];
  ["seg", "ter", "qua", "qui", "sex", "sab", "dom"].forEach(d => {
    const h = HORARIOS[d];
    const li = el("li", (d === hoje ? "hoje " : "") + (h ? "" : "fechado"));
    li.innerHTML = `<span>${NOMES[d]}${d === hoje ? " · hoje" : ""}</span>
                    <span>${h ? h[0] + " às " + h[1] : "Fechado"}</span>`;
    ul.appendChild(li);
  });
  $("#infoObs").textContent = ACEITA_FORA_DO_HORARIO
    ? "Fora do horário você ainda pode enviar o pedido — ele entra na fila do próximo turno."
    : "Fora do horário o envio de pedidos fica desativado.";
})();

/* selos da capa */
(function () {
  const ul = $("#capaMeta"), itens = [];

  if (NO_LOCAL) {
    /* quem veio do QR já está no salão: falar de taxa e entrega aqui confunde */
    itens.push(MESA ? `🪑 Você está na <b>Mesa ${esc(MESA)}</b>`
                    : `🪑 Você está <b>no local</b>`);
    itens.push(`📱 Peça daqui, <b>sem esperar</b> o garçom`);
  } else {
    if (ENTREGA.tempo) itens.push(`🛵 <b>${esc(ENTREGA.tempo)}</b>`);
    const taxas = Object.values(ENTREGA.bairros || {});
    const menor = taxas.length ? Math.min(...taxas) : ENTREGA.taxaPadrao;
    itens.push(menor > 0 ? `📍 Taxa a partir de <b>${brl(menor)}</b>` : `📍 <b>Entrega grátis</b> no bairro`);
    if (ENTREGA.minimo > 0) itens.push(`🧾 Mínimo <b>${brl(ENTREGA.minimo)}</b>`);
  }

  ul.innerHTML = itens.map(t => `<li>${t}</li>`).join("");
})();

/* info: lista de dados */
(function () {
  const dl = $("#infoLista"), linhas = [];
  linhas.push(["Pedidos", LOJA.telefone || "WhatsApp"]);
  if (LOJA.endereco) linhas.push(["Endereço", LOJA.endereco]);
  if (LOJA.cidade)   linhas.push(["Cidade", LOJA.cidade]);
  if (ENTREGA.tempo) linhas.push(["Tempo de entrega", ENTREGA.tempo]);
  linhas.push(["Pagamento", (ENTREGA.pagamentos || []).join(" · ")]);
  dl.innerHTML = linhas.map(([a, b]) =>
    `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join("");

  if (LOJA.pix) {
    $("#pixBox").hidden = false;
    $("#pixChave").textContent = LOJA.pix;
    $("#pixNome").textContent  = LOJA.pixNome || "";
    $("#pixCopiar").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(LOJA.pix); toast("Chave Pix copiada ✅"); }
      catch { toast("Copie manualmente: " + LOJA.pix); }
    });
  }

  const links = $("#ftLinks");
  if (LOJA.instagram) links.insertAdjacentHTML("beforeend",
    `<a href="https://instagram.com/${esc(LOJA.instagram)}" target="_blank" rel="noopener">📷 @${esc(LOJA.instagram)}</a>`);
  if (LOJA.mapa) links.insertAdjacentHTML("beforeend",
    `<a href="${esc(LOJA.mapa)}" target="_blank" rel="noopener">📍 Ver no mapa</a>`);
  links.insertAdjacentHTML("beforeend",
    `<a href="${zapURL("Olá! Vi o cardápio do " + LOJA.nome)}" target="_blank" rel="noopener">💬 WhatsApp</a>`);

  if (navigator.share) {
    const b = $("#btnShare"); b.hidden = false;
    b.addEventListener("click", () => navigator.share({
      title: LOJA.nome, text: `Cardápio do ${LOJA.nome}`, url: location.href
    }).catch(() => {}));
  }
})();


/* ==========================================================================
   4 · CARDÁPIO — indexação e montagem
   ========================================================================== */

const INDICE = new Map();     // uid -> { grupo, item }
CARDAPIO.forEach(g => g.itens.forEach(it => {
  it._uid = g.id + "::" + it.n;
  INDICE.set(it._uid, { grupo: g, item: it });
}));

function midiaHTML(it, cls) {
  return it.img
    ? `<div class="${cls}"><img src="${esc(it.img)}" alt="${esc(it.n)}" loading="lazy"></div>`
    : `<div class="${cls.replace("-img", "-em")}" aria-hidden="true">${esc(it.e || LOJA.emoji || "🍔")}</div>`;
}
const precoHTML = it =>
  (it.de ? `<span class="preco-de">${brl(it.de)}</span>` : "") +
  `<span class="preco">${brl(it.p)}</span>`;

/* ---- destaques ---- */
(function () {
  const favs = [];
  CARDAPIO.forEach(g => g.itens.forEach(it => { if (it.fav) favs.push(it); }));
  if (favs.length < 2) return;

  $("#destSec").hidden = false;
  const trilho = $("#destTrilho");

  favs.forEach(it => {
    const c = el("article", "card");
    c.innerHTML = `
      <div class="card-img">
        ${it.tag ? `<span class="selo">${esc(it.tag)}</span>` : ""}
        ${it.img ? `<img src="${esc(it.img)}" alt="${esc(it.n)}" loading="lazy">`
                 : `<div class="card-em" aria-hidden="true">${esc(it.e || LOJA.emoji || "🍔")}</div>`}
      </div>
      <div class="card-txt">
        <h4>${esc(it.n)}</h4>
        <p>${esc(it.d || "")}</p>
        <div class="card-pe"><span>${precoHTML(it)}</span>
          <span class="mais" aria-hidden="true">+</span></div>
      </div>`;
    c.setAttribute("role", "button");
    c.tabIndex = 0;
    c.addEventListener("click", () => abreProduto(it._uid));
    c.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abreProduto(it._uid); }
    });
    trilho.appendChild(c);
  });

  const passo = () => trilho.querySelector(".card").offsetWidth + 14;
  $("#destL").addEventListener("click", () => trilho.scrollBy({ left: -passo(), behavior: "smooth" }));
  $("#destR").addEventListener("click", () => trilho.scrollBy({ left:  passo(), behavior: "smooth" }));
})();

/* ---- categorias + grupos ---- */
const raiz = $("#menuRoot"), navCats = $("#cats");

CARDAPIO.forEach(g => {
  const chip = el("button", null, esc(g.cat));
  chip.dataset.ir = g.id;
  navCats.appendChild(chip);

  const sec = el("section", "grupo");
  sec.id = g.id;
  sec.innerHTML = `<div class="grupo-hd"><h3>${esc(g.cat)}</h3><i></i>
                   ${g.tag ? `<em>${esc(g.tag)}</em>` : ""}</div>`;

  const lista = el("div", g.compacto ? "compacto" : "itens");

  g.itens.forEach(it => {
    const n = el("article", g.compacto ? "linha-item" : "item");
    n.dataset.uid = it._uid;
    n.dataset.busca = (it.n + " " + (it.d || "") + " " + g.cat).toLowerCase();

    n.innerHTML = g.compacto
      ? `<b>${esc(it.n)}</b>
         <span class="li-r">${precoHTML(it)}
         <button class="mais" aria-label="Adicionar ${esc(it.n)}">+</button></span>`
      : `${midiaHTML(it, "item-img")}
         ${it.tag ? `<span class="selo">${esc(it.tag)}</span>` : ""}
         <div class="item-txt"><h4>${esc(it.n)}</h4><p>${esc(it.d || "")}</p></div>
         <div class="item-lado">${precoHTML(it)}
         <button class="mais" aria-label="Adicionar ${esc(it.n)}">+</button></div>`;

    n.addEventListener("click", () => abreProduto(it._uid));
    lista.appendChild(n);
  });

  sec.appendChild(lista);
  raiz.appendChild(sec);
});

/* animação de entrada */
if (suave) {
  const olho = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("vis"); olho.unobserve(e.target); }
  }), { rootMargin: "0px 0px -8% 0px" });
  $$(".item, .linha-item").forEach(n => olho.observe(n));
} else {
  $$(".item, .linha-item").forEach(n => n.classList.add("vis"));
}

/* clique na categoria */
navCats.addEventListener("click", e => {
  const b = e.target.closest("button[data-ir]");
  if (b) document.getElementById(b.dataset.ir)
    .scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" });
});

/* qual categoria está na tela */
const espia = new IntersectionObserver(es => {
  es.forEach(e => {
    if (!e.isIntersecting) return;
    navCats.querySelectorAll("button").forEach(b => {
      const on = b.dataset.ir === e.target.id;
      b.classList.toggle("on", on);
      if (on) b.scrollIntoView({ behavior: suave ? "smooth" : "auto",
                                 block: "nearest", inline: "center" });
    });
  });
}, { rootMargin: "-130px 0px -64% 0px" });
$$(".grupo").forEach(g => espia.observe(g));

/* topo com borda ao rolar */
addEventListener("scroll", () => $("#hdr").classList.toggle("desceu", scrollY > 12), { passive: true });


/* ==========================================================================
   5 · BUSCA
   ========================================================================== */
(function () {
  const box = $("#buscaBox"), input = $("#buscaInput");

  $("#btnBusca").addEventListener("click", () => {
    box.hidden = !box.hidden;
    if (!box.hidden) { input.focus(); box.scrollIntoView({ block: "center" }); }
    else { input.value = ""; filtra(""); }
  });
  $("#buscaX").addEventListener("click", () => { input.value = ""; filtra(""); input.focus(); });
  input.addEventListener("input", () => filtra(input.value));

  function filtra(termo) {
    const t = termo.trim().toLowerCase();
    let achou = 0;
    $$("[data-busca]").forEach(n => {
      const ok = !t || n.dataset.busca.includes(t);
      n.hidden = !ok;
      if (ok) achou++;
    });
    $$(".grupo").forEach(g => {
      g.hidden = ![...g.querySelectorAll("[data-busca]")].some(n => !n.hidden);
    });
    $("#nada").hidden = achou > 0;
    $("#destSec").style.display = t ? "none" : "";
  }
})();


/* ==========================================================================
   6 · CARRINHO
   ========================================================================== */

const CHAVE = "cardapio:" + LOJA.nome;
let carrinho = [];      // [{ uid, extras:[{g,n,p}], obs, q }]

const precoBase  = uid => (INDICE.get(uid)?.item.p) || 0;
const precoLinha = l => precoBase(l.uid) + l.extras.reduce((s, e) => s + e.p, 0);
const nomeLinha  = l => INDICE.get(l.uid)?.item.n || "";
const chaveLinha = l => l.uid + "|" + l.extras.map(e => e.n).sort().join(",") + "|" + (l.obs || "");
const subtotal   = () => carrinho.reduce((s, l) => s + precoLinha(l) * l.q, 0);
const totalQtd   = () => carrinho.reduce((s, l) => s + l.q, 0);

function salva() {
  try { localStorage.setItem(CHAVE, JSON.stringify(carrinho)); } catch {}
}
function restaura() {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) || "[]");
    carrinho = bruto.filter(l => l && INDICE.has(l.uid))
      .map(l => ({ uid: l.uid, extras: Array.isArray(l.extras) ? l.extras : [],
                   obs: l.obs || "", q: Math.max(1, Number(l.q) || 1) }));
  } catch { carrinho = []; }
}

function addLinha(linha, origem) {
  const k = chaveLinha(linha);
  const igual = carrinho.find(l => chaveLinha(l) === k);
  if (igual) igual.q += linha.q; else carrinho.push(linha);
  salva(); pintaBarra(); pintaMarcados();
  if (origem) voa(origem);
}

function mudaQtd(k, d) {
  const i = carrinho.findIndex(l => chaveLinha(l) === k);
  if (i < 0) return;
  carrinho[i].q += d;
  if (carrinho[i].q <= 0) carrinho.splice(i, 1);
  salva(); pintaBarra(); pintaCarrinho(); pintaMarcados();
}

function pintaMarcados() {
  const ativos = new Set(carrinho.map(l => l.uid));
  $$("[data-uid]").forEach(n => n.classList.toggle("no-carrinho", ativos.has(n.dataset.uid)));
}

function pintaBarra() {
  const q = totalQtd(), barra = $("#barra");
  barra.hidden = q === 0;
  document.documentElement.style.setProperty("--barra-h", q ? "86px" : "0px");
  const n = $("#barraN");
  if (n.textContent !== String(q)) {
    n.textContent = q;
    if (suave) { n.classList.remove("bump"); void n.offsetWidth; n.classList.add("bump"); }
  }
  $("#barraTotal").textContent = brl(subtotal());
}

/* "+1" voando pra barra */
function voa(origem) {
  if (!suave || !origem) return;
  const r = origem.getBoundingClientRect();
  const bolha = el("div", "voa", "+1");
  bolha.style.left = r.left + r.width / 2 - 17 + "px";
  bolha.style.top  = r.top + r.height / 2 - 17 + "px";
  document.body.appendChild(bolha);
  const alvo = $("#barra").getBoundingClientRect();
  bolha.animate([
    { transform: "translate(0,0) scale(1)", opacity: 1 },
    { transform: `translate(${alvo.left + alvo.width / 2 - r.left - r.width / 2}px,
                            ${alvo.top + 24 - r.top}px) scale(.4)`, opacity: 0 }
  ], { duration: 550, easing: "cubic-bezier(.4,0,.7,1)" })
   .onfinish = () => bolha.remove();
}

let horaToast;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(horaToast);
  horaToast = setTimeout(() => { t.hidden = true; }, 2600);
}


/* ==========================================================================
   7 · FOLHAS (modais)
   ========================================================================== */

let folhaAberta = null, focoAntes = null;

function abre(id) {
  focoAntes = document.activeElement;
  folhaAberta = $(id);
  folhaAberta.hidden = false;
  document.body.style.overflow = "hidden";
  folhaAberta.querySelector(".folha").scrollTop = 0;
  const corpo = folhaAberta.querySelector(".folha-corpo");
  if (corpo) corpo.scrollTop = 0;
}
function fecha() {
  if (!folhaAberta) return;
  folhaAberta.hidden = true;
  folhaAberta = null;
  document.body.style.overflow = "";
  focoAntes?.focus?.();
}
$$("[data-fecha]").forEach(n => n.addEventListener("click", fecha));
addEventListener("keydown", e => { if (e.key === "Escape") fecha(); });


/* ---------------------- folha do produto ---------------------- */
let atual = null;   // { uid, item, extras:Map, qtd }

function abreProduto(uid) {
  const reg = INDICE.get(uid);
  if (!reg) return;
  const it = reg.item;
  atual = { uid, item: it, extras: new Map(), qtd: 1 };

  $("#prodCapa").innerHTML = it.img
    ? `<img src="${esc(it.img)}" alt="${esc(it.n)}">`
    : `<div class="card-em" aria-hidden="true">${esc(it.e || LOJA.emoji || "🍔")}</div>`;

  const tag = $("#prodTag");
  tag.hidden = !it.tag;
  tag.textContent = it.tag || "";

  $("#prodNome").textContent = it.n;
  $("#prodD").textContent = it.d || "";
  $("#prodD").hidden = !it.d;
  $("#prodP").innerHTML = precoHTML(it);
  $("#prodObs").value = "";
  $("#prodQtd").querySelector("span").textContent = "1";

  /* grupos de adicionais */
  const zona = $("#prodExtras");
  zona.innerHTML = "";
  (it.extras || []).forEach(chave => {
    const g = EXTRAS[chave];
    if (!g) return;
    const unica = g.tipo === "unica";

    const bloco = el("div", "gx");
    bloco.innerHTML = `<div class="gx-hd"><b>${esc(g.titulo)}</b>
      <em class="${g.obrigatorio ? "req" : ""}">${
        g.obrigatorio ? "Escolha 1" : (unica ? "Escolha 1" : "Opcional")}</em></div>`;

    const lista = el("div", "gx-lista");
    g.opcoes.forEach((op, i) => {
      const lb = el("label", "op");
      lb.innerHTML = `
        <input type="${unica ? "radio" : "checkbox"}" name="gx-${chave}" ${
          unica && g.obrigatorio && i === 0 ? "checked" : ""}>
        <span class="op-marca ${unica ? "redondo" : "quadrado"}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 5.5 5.5L20 7"/></svg>
        </span>
        <span class="op-n">${esc(op.n)}</span>
        ${op.p ? `<span class="op-p">+ ${brl(op.p)}</span>` : ""}`;

      const inp = lb.querySelector("input");
      inp.addEventListener("change", () => {
        if (unica) {
          atual.extras.set(chave, [{ g: g.titulo, n: op.n, p: op.p }]);
          lista.querySelectorAll(".op").forEach(o => o.classList.remove("on"));
          lb.classList.add("on");
        } else {
          const arr = atual.extras.get(chave) || [];
          const sem = arr.filter(x => x.n !== op.n);
          if (inp.checked) sem.push({ g: g.titulo, n: op.n, p: op.p });
          atual.extras.set(chave, sem);
          lb.classList.toggle("on", inp.checked);
        }
        pintaPrecoProduto();
      });

      if (inp.checked) { lb.classList.add("on"); inp.dispatchEvent(new Event("change")); }
      lista.appendChild(lb);
    });

    bloco.appendChild(lista);
    bloco.dataset.grupo = chave;
    bloco.dataset.obrigatorio = g.obrigatorio ? "1" : "";
    zona.appendChild(bloco);
  });

  pintaPrecoProduto();
  abre("#prodModal");
}

const extrasLista = () => [...atual.extras.values()].flat();

function pintaPrecoProduto() {
  const un = atual.item.p + extrasLista().reduce((s, e) => s + e.p, 0);
  $("#prodAddP").textContent = brl(un * atual.qtd);
}

$("#prodQtd").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b || !atual) return;
  const menos = b === $("#prodQtd").firstElementChild;
  atual.qtd = Math.max(1, atual.qtd + (menos ? -1 : 1));
  $("#prodQtd").querySelector("span").textContent = atual.qtd;
  pintaPrecoProduto();
});

$("#prodAdd").addEventListener("click", () => {
  if (!atual) return;

  /* valida grupos obrigatórios */
  const faltando = [...$("#prodExtras").children].find(b =>
    b.dataset.obrigatorio && !(atual.extras.get(b.dataset.grupo) || []).length);
  if (faltando) {
    faltando.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "center" });
    toast("Escolha uma opção em “" + faltando.querySelector("b").textContent + "”");
    return;
  }

  addLinha({ uid: atual.uid, extras: extrasLista(),
             obs: $("#prodObs").value.trim(), q: atual.qtd },
           $("#prodAdd"));
  const nome = atual.item.n;
  fecha();
  toast(`${nome} no pedido ✅`);
});


/* ---------------------- folha do pedido ---------------------- */
const temBairros = Object.keys(ENTREGA.bairros || {}).length > 0;

/* O modo do pedido depende de COMO o cliente chegou no cardápio:

     sem mesa (link normal)  → está em casa. Só entrega, sem escolha nenhuma.
     com mesa (QR da mesa)   → está no salão. Escolhe entre comer ali ou levar.
                               Não faz sentido oferecer entrega pra quem já
                               está sentado na mesa.                          */
const ROTULO = {
  Entrega: "Entrega",
  Local:   NA_MESA.comer,
  Viagem:  NA_MESA.viagem
};

/* segunda linha do botão: quem bate o olho rápido não erra a escolha */
const SUB = {
  Local:  MESA ? `na mesa ${MESA}` : "aqui no local",
  Viagem: "levar embora"
};

/* NA_MESA.viagem vazio no config trava tudo em "comer aqui" */
const OPCOES = NO_LOCAL
  ? (NA_MESA.viagem ? ["Local", "Viagem"] : ["Local"])
  : ["Entrega"];

let modo = OPCOES[0];
let pagamento = (ENTREGA.pagamentos || ["Pix"])[0];

(function () {
  const seg = $("#segModo");
  const campo = seg.closest(".campo");

  /* com uma opção só não existe escolha a fazer: esconde o campo inteiro */
  if (OPCOES.length < 2) {
    campo.hidden = true;
  } else {
    campo.querySelector(".campo-lbl").textContent = NA_MESA.pergunta;
    seg.innerHTML = OPCOES.map(o =>
      `<button class="${o === modo ? "on" : ""}" data-modo="${o}"><b>${esc(ROTULO[o])}</b>${
        SUB[o] ? `<em>${esc(SUB[o])}</em>` : ""}</button>`).join("");
  }

  const ajusta = () => {
    const entrega = modo === "Entrega";
    $("#cpEnd").hidden    = !entrega;
    $("#cpBairro").hidden = !entrega || !temBairros;
  };

  seg.addEventListener("click", e => {
    const b = e.target.closest("button[data-modo]");
    if (!b) return;
    modo = b.dataset.modo;
    seg.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    ajusta();
    pintaConta();
  });

  ajusta();
})();

/* bairros */
(function () {
  if (!temBairros) { $("#cpBairro").hidden = true; return; }
  const sel = $("#inBairro");
  sel.innerHTML = Object.entries(ENTREGA.bairros).map(([b, t]) =>
    `<option value="${esc(b)}">${esc(b)} — ${t > 0 ? brl(t) : "grátis"}</option>`).join("");
  sel.addEventListener("change", pintaConta);
})();

/* formas de pagamento */
(function () {
  const seg = $("#segPag");
  seg.innerHTML = (ENTREGA.pagamentos || []).map((p, i) =>
    `<button class="${i === 0 ? "on" : ""}" data-pag="${esc(p)}">${esc(p)}</button>`).join("");
  seg.addEventListener("click", e => {
    const b = e.target.closest("button[data-pag]");
    if (!b) return;
    pagamento = b.dataset.pag;
    seg.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    $("#cpTroco").hidden = !/dinheiro/i.test(pagamento);
  });
  $("#cpTroco").hidden = !/dinheiro/i.test(pagamento);
})();

const taxa = () => {
  if (modo !== "Entrega") return 0;
  if (!temBairros) return ENTREGA.taxaPadrao || 0;
  const b = $("#inBairro").value;
  return ENTREGA.bairros[b] ?? ENTREGA.taxaPadrao ?? 0;
};

function pintaConta() {
  const sub = subtotal(), tx = taxa();

  /* O cliente distraído tem que topar com o contexto três vezes antes de
     enviar: no título da folha, na conta e no próprio botão de enviar. */
  const onde = MESA ? `Mesa ${MESA}` : "No local";
  $("#ctModo").textContent = NO_LOCAL ? `${onde} · ${ROTULO[modo]}` : ROTULO[modo];
  $("#pedTitulo").textContent = NO_LOCAL
    ? (MESA ? `Pedido da Mesa ${MESA}` : "Pedido no local")
    : "Seu pedido";
  $("#enviarTxt").textContent = NO_LOCAL
    ? `Enviar pedido · ${onde}`
    : "Enviar pedido no WhatsApp";

  $("#ctItens").textContent = brl(sub);
  $("#ctTaxa").textContent  = tx > 0 ? brl(tx) : "grátis";
  $("#ctTaxaLinha").hidden  = modo !== "Entrega";
  $("#ctTotal").textContent = brl(sub + tx);

  const av = $("#aviso");
  const botao = $("#enviar");
  let msg = "", travado = false;

  /* o mínimo é regra de entrega — não vale pra quem está na mesa */
  if (modo === "Entrega" && ENTREGA.minimo > 0 && sub < ENTREGA.minimo) {
    msg = `Pedido mínimo de ${brl(ENTREGA.minimo)}. Faltam ${brl(ENTREGA.minimo - sub)}.`;
    travado = true;
  } else if (!ST.aberto) {
    msg = ST.abre
      ? `Estamos fechados agora — abrimos ${ST.quando} às ${ST.abre}.` +
        (ACEITA_FORA_DO_HORARIO ? " Você pode enviar o pedido e ele entra na fila." : "")
      : "Estamos fechados agora.";
    travado = !ACEITA_FORA_DO_HORARIO;
  }

  av.hidden = !msg;
  av.textContent = msg;
  botao.disabled = travado || !carrinho.length;
}

function pintaCarrinho() {
  const ul = $("#carrinho");
  ul.innerHTML = "";

  if (!carrinho.length) {
    ul.innerHTML = `<li class="c-vazio">Seu pedido está vazio.<br>Volte no cardápio e escolha algo bom. ${LOJA.emoji || "🍔"}</li>`;
  } else {
    carrinho.forEach(l => {
      const k = chaveLinha(l);
      const detalhe = [
        l.extras.filter(e => e.p > 0).map(e => "+ " + e.n).join(", "),
        l.extras.filter(e => e.p === 0).map(e => e.n).join(", "),
        l.obs ? "obs: " + l.obs : ""
      ].filter(Boolean).join(" · ");

      const li = el("li");
      li.innerHTML = `
        <div class="qtd">
          <button aria-label="Diminuir">&minus;</button><span>${l.q}</span><button aria-label="Aumentar">+</button>
        </div>
        <div class="c-n"><b>${esc(nomeLinha(l))}</b>
          <span>${esc(detalhe || brl(precoLinha(l)) + " cada")}</span></div>
        <div class="c-p">${brl(precoLinha(l) * l.q)}</div>`;

      const q = li.querySelector(".qtd");
      q.children[0].addEventListener("click", () => mudaQtd(k, -1));
      q.children[2].addEventListener("click", () => mudaQtd(k, +1));
      ul.appendChild(li);
    });
  }
  pintaConta();
}

$("#barraAbrir").addEventListener("click", () => { pintaCarrinho(); abre("#pedModal"); });

$("#limpar").addEventListener("click", () => {
  carrinho = [];
  salva(); pintaBarra(); pintaCarrinho(); pintaMarcados(); fecha();
  toast("Pedido limpo");
});


/* ==========================================================================
   8 · ENVIO PRO WHATSAPP
   ========================================================================== */

$("#enviar").addEventListener("click", () => {
  if (!carrinho.length) return;

  const nome = $("#inNome").value.trim();
  const end  = $("#inEnd").value.trim();

  if (modo === "Entrega" && !end) {
    $("#cpEnd").classList.add("erro");
    $("#inEnd").focus();
    toast("Escreva o endereço da entrega");
    setTimeout(() => $("#cpEnd").classList.remove("erro"), 2500);
    return;
  }

  const codigo = "#" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const tx = taxa(), sub = subtotal();
  const L = [];

  L.push(`*PEDIDO ${codigo} — ${LOJA.nome.toUpperCase()}*`);
  if (NO_LOCAL) L.push(`*🪑 ${MESA ? "MESA " + MESA : "NO LOCAL"} · ${ROTULO[modo].toUpperCase()}*`);
  L.push("");

  carrinho.forEach(l => {
    L.push(`*${l.q}x* ${nomeLinha(l)} — ${brl(precoLinha(l) * l.q)}`);
    const pagos = l.extras.filter(e => e.p > 0).map(e => e.n + " (+" + brl(e.p) + ")");
    const zero  = l.extras.filter(e => e.p === 0).map(e => e.n);
    if (pagos.length) L.push(`   ↳ ${pagos.join(", ")}`);
    if (zero.length)  L.push(`   ↳ ${zero.join(", ")}`);
    if (l.obs)        L.push(`   ↳ obs: ${l.obs}`);
  });

  L.push("", `Itens: ${brl(sub)}`);
  if (modo === "Entrega") L.push(`Taxa de entrega: ${tx > 0 ? brl(tx) : "grátis"}`);
  L.push(`*TOTAL: ${brl(sub + tx)}*`, "");

  /* pedido de mesa já leva MESA + tipo no cabeçalho, não repete aqui */
  if (modo === "Entrega") L.push("*🛵 ENTREGA*");
  if (nome) L.push(`Nome: ${nome}`);
  if (modo === "Entrega") {
    if (temBairros) L.push(`Bairro: ${$("#inBairro").value}`);
    L.push(`Endereço: ${end}`);
  }
  L.push(`Pagamento: ${pagamento}`);

  const troco = $("#inTroco").value.trim();
  if (/dinheiro/i.test(pagamento) && troco) L.push(`Troco para: R$ ${troco}`);

  if (!ST.aberto) L.push("", "_⚠️ Pedido enviado fora do horário de funcionamento._");

  window.open(zapURL(L.join("\n")), "_blank");
  toast("Abrindo o WhatsApp... 🚀");
});


/* ==========================================================================
   9 · PAINEL DEMO — troca a paleta ao vivo na reunião
   ========================================================================== */

if (typeof DEMO !== "undefined" && DEMO) {
  const painel = $("#demo");
  painel.hidden = false;

  const grid = $("#demoGrid");
  const code = $("#demoCode");
  const marca = nome => {
    code.innerHTML = `const TEMA = "${nome}";`;
    grid.querySelectorAll(".demo-op").forEach(b => b.classList.toggle("on", b.dataset.p === nome));
  };

  Object.entries(PALETAS).forEach(([nome, p]) => {
    const b = el("button", "demo-op");
    b.dataset.p = nome;
    b.innerHTML = `<span class="demo-bolas">
        <i style="background:${p.marca}"></i><i style="background:${p.marca2}"></i>
        <i style="background:${p.fundo}"></i></span>${nome}`;
    b.addEventListener("click", () => { aplicaTema(nome); marca(nome); });
    grid.appendChild(b);
  });

  marca(typeof TEMA === "string" ? TEMA : "personalizada");
  $("#demoBtn").addEventListener("click", () => {
    const box = $("#demoBox");
    box.hidden = !box.hidden;
  });
}


/* ==========================================================================
   10 · LIGA TUDO
   ========================================================================== */
restaura();
pintaBarra();
pintaMarcados();
pintaConta();

})();
