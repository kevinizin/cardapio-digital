/* ==========================================================================
   CARDÁPIO DIGITAL  ·  ARQUIVO DE CONFIGURAÇÃO
   --------------------------------------------------------------------------
   ESTE É O ÚNICO ARQUIVO QUE VOCÊ PRECISA MEXER PARA CADA CLIENTE NOVO.
   Não encoste em app.js nem em style.css.

   Ordem das seções:
     1 · MARCA .......... nome, logo, WhatsApp, redes
     2 · TEMA ........... paleta de cores (troca o site inteiro numa linha)
     3 · CAPA ........... título grande e frases da abertura
     4 · HORÁRIOS ....... abre/fecha automático
     5 · ENTREGA ........ taxa por bairro, mínimo, formas de pagamento
     6 · ADICIONAIS ..... grupos de opções (bacon, ponto da carne...)
     7 · CARDÁPIO ....... os produtos
   ========================================================================== */


/* ==========================================================================
   1 · MARCA
   ========================================================================== */

const LOJA = {
  nome:    "Brasa & Bacon",
  slogan:  "lanches artesanais",

  /* LOGO — coloque o arquivo em img/ e escreva o caminho aqui.
     Se deixar "" (vazio), o site desenha sozinho um monograma com as
     iniciais do nome. Serve de quebra-galho até o cliente mandar a logo. */
  logo:    "",                      // ex: "img/logo.png"

  emoji:   "🍔",                    // aparece na abinha do navegador
  cidade:  "Manaus · AM",
  endereco: "Av. das Torres, 1200 — Cidade Nova",

  whatsapp: "5592999999999",        // 55 + DDD + número, SÓ NÚMEROS
  telefone: "(92) 99999-9999",      // como aparece escrito na tela

  instagram: "brasaebacon",         // só o @, sem o arroba. "" esconde
  mapa: "",                         // link do Google Maps. "" esconde

  /* Chave PIX — o cliente toca e copia. Deixe "" pra esconder. */
  pix:     "brasaebacon@gmail.com",
  pixNome: "Brasa & Bacon Lanches"
};


/* ==========================================================================
   2 · TEMA  ·  A PALETA DE CORES
   --------------------------------------------------------------------------
   Escreva abaixo o nome de uma das paletas prontas:

       "brasa"   preto + dourado + vermelho   (hamburgueria clássica)
       "neon"    grafite + rosa + ciano        (moderno, público jovem)
       "retro"   creme + vermelho             (diner americano, tema claro)
       "verde"   verde escuro + limão         (natural, açaí, saudável)
       "cafe"    marrom + creme               (cafeteria, tema claro)
       "fogo"    preto + laranja              (churrasco, espeto, brasa)

   Quer a cor exata da marca do cliente? Copie uma paleta lá embaixo,
   dê um nome novo e troque os hex. Ou passe o objeto direto aqui.
   ========================================================================== */

const TEMA = "brasa";

/* ---- as paletas ---- */
const PALETAS = {

  brasa: {
    claro: false,
    fundo:   "#0A0908",   // fundo da página
    caixa:   "#151210",   // fundo dos cartões
    caixa2:  "#1E1A16",   // fundo de campos e botões neutros
    linha:   "#2B2521",   // bordas
    texto:   "#F6F1E8",   // texto principal
    texto2:  "#A2978A",   // texto secundário
    marca:   "#E8B33C",   // ★ cor principal: preços, botões, destaques
    marca2:  "#C4351B"    // ★ cor de apoio: tags, selos, detalhes
  },

  neon: {
    claro: false,
    fundo:   "#0B0B13",
    caixa:   "#14141F",
    caixa2:  "#1C1C2B",
    linha:   "#2A2A3D",
    texto:   "#F2F2FA",
    texto2:  "#9A9AB5",
    marca:   "#FF3D7F",
    marca2:  "#20E3C1"
  },

  retro: {
    claro: true,
    fundo:   "#FBF3E4",
    caixa:   "#FFFFFF",
    caixa2:  "#F4E9D6",
    linha:   "#E2D2B8",
    texto:   "#241A12",
    texto2:  "#7A6A56",
    marca:   "#D62828",
    marca2:  "#F4A800"
  },

  verde: {
    claro: false,
    fundo:   "#07120D",
    caixa:   "#0F1F17",
    caixa2:  "#162C21",
    linha:   "#22402F",
    texto:   "#EDF7F0",
    texto2:  "#8FAE9C",
    marca:   "#9BE564",
    marca2:  "#FF9F45"
  },

  cafe: {
    claro: true,
    fundo:   "#F7F1EA",
    caixa:   "#FFFFFF",
    caixa2:  "#EFE5D9",
    linha:   "#DECDB9",
    texto:   "#2B1D14",
    texto2:  "#7B6553",
    marca:   "#8B4513",
    marca2:  "#C98A3E"
  },

  fogo: {
    claro: false,
    fundo:   "#0C0A09",
    caixa:   "#17120F",
    caixa2:  "#211A15",
    linha:   "#33241C",
    texto:   "#FFF6EE",
    texto2:  "#A8927F",
    marca:   "#FF6B1A",
    marca2:  "#FFC53D"
  }

};

/* ---- fontes ----
   display = título grandão / preco = corpo do texto.
   Deixe como está que funciona bem em qualquer lanchonete. */
const FONTES = {
  google:  "Anton&family=Plus+Jakarta+Sans:wght@400;500;600;700;800",
  display: "'Anton', 'Impact', sans-serif",
  texto:   "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif"
};


/* ==========================================================================
   3 · CAPA  ·  a primeira coisa que o cliente vê
   ========================================================================== */

const CAPA = {
  /* No título, o que estiver entre  *asteriscos*  sai pintado com a cor da marca */
  titulo: "Feito na chapa,\nservido *na hora*.",
  sub:    "Pão brioche assado no dia, carne de 180g e bacon que estala. Monte seu pedido aqui e receba em casa.",

  /* Foto de fundo. Deixe "" e o site usa um fundo gráfico com a cor da marca. */
  imagem: "",                       // ex: "img/capa.jpg"

  /* Faixa que passa correndo embaixo da capa */
  selos: [
    "🔥 Feito na hora",
    "🥩 Carne 180g",
    "🛵 Entrega rápida",
    "🧀 Cheddar cremoso",
    "🌶️ Molhos da casa"
  ]
};


/* ==========================================================================
   4 · HORÁRIOS  ·  o site abre e fecha sozinho
   --------------------------------------------------------------------------
   ["18:00", "23:30"]  = abre 18h, fecha 23h30
   ["18:00", "01:00"]  = vira a madrugada, sem problema
   null                = fechado nesse dia
   ========================================================================== */

const HORARIOS = {
  seg: null,
  ter: ["18:00", "23:30"],
  qua: ["18:00", "23:30"],
  qui: ["18:00", "23:30"],
  sex: ["18:00", "01:00"],
  sab: ["18:00", "01:00"],
  dom: ["18:00", "23:00"]
};

/* Pra testar: deixe null no dia a dia.
   true  = força ABERTO   |   false = força FECHADO */
const FORCAR = null;

/* Quando estiver fechado, ainda deixa o cliente mandar o pedido?
   true  = aceita (o pedido chega marcado como "fora do horário")
   false = trava o botão e só mostra o horário */
const ACEITA_FORA_DO_HORARIO = true;


/* ==========================================================================
   5 · ENTREGA E PAGAMENTO
   ========================================================================== */

const ENTREGA = {
  tempo:   "30 a 45 min",
  minimo:  0,                 // pedido mínimo em reais. 0 = sem mínimo
                              // (só vale pra entrega, não pra pedido de mesa)

  taxaPadrao: 6.00,           // taxa usada quando não tem lista de bairros

  /* Taxa por bairro. Deixe {} (vazio) pra usar só a taxa padrão.
     Coloque 0 no bairro da loja pra sair "grátis". */
  bairros: {
    "Cidade Nova":   0,
    "Novo Aleixo":   6.00,
    "Cidade de Deus": 7.00,
    "Monte das Oliveiras": 8.00,
    "Santa Etelvina": 8.00,
    "Outro bairro":  10.00
  },

  pagamentos: ["Pix", "Dinheiro", "Cartão na entrega"]
};


/* ==========================================================================
   5b · PEDIDO NA MESA  ·  quem entra pelo QR Code da mesa
   --------------------------------------------------------------------------
   O cardápio se comporta de dois jeitos, conforme o cliente chegou:

     LINK NORMAL (de casa)   → só entrega. Pede bairro e endereço.
     QR CODE DA MESA         → não pergunta entrega nenhuma. O cliente já
                               está no salão, então só escolhe se come ali
                               ou leva. Sem taxa e sem endereço.

   Aqui você troca só as palavras dos dois botões.
   ========================================================================== */

const NA_MESA = {
  pergunta: "Vai comer aqui ou levar?",
  comer:    "Comer aqui",
  viagem:   "Pra viagem"     // deixe ""  pra TRAVAR em "comer aqui" e não
                             // aparecer escolha nenhuma pra quem está na mesa
};


/* ==========================================================================
   6 · ADICIONAIS  ·  grupos de opções que aparecem ao tocar num produto
   --------------------------------------------------------------------------
   tipo: "varios"  → cliente marca quantos quiser (bacon, cheddar...)
   tipo: "unica"   → cliente escolhe só 1 (ponto da carne, sabor...)
   obrigatorio: true → não deixa adicionar sem escolher
   ========================================================================== */

const EXTRAS = {

  ponto: {
    titulo: "Ponto da carne",
    tipo: "unica",
    obrigatorio: true,
    opcoes: [
      { n: "Ao ponto",     p: 0 },
      { n: "Bem passado",  p: 0 },
      { n: "Mal passado",  p: 0 }
    ]
  },

  turbina: {
    titulo: "Turbine seu lanche",
    tipo: "varios",
    opcoes: [
      { n: "Bacon crocante",      p: 5.00 },
      { n: "Cheddar cremoso",     p: 4.00 },
      { n: "Ovo",                 p: 2.50 },
      { n: "Carne extra 180g",    p: 9.00 },
      { n: "Cebola caramelizada", p: 3.00 },
      { n: "Catupiry",            p: 4.00 }
    ]
  },

  tirar: {
    titulo: "Prefere sem alguma coisa?",
    tipo: "varios",
    opcoes: [
      { n: "sem cebola",  p: 0 },
      { n: "sem tomate",  p: 0 },
      { n: "sem alface",  p: 0 },
      { n: "sem picles",  p: 0 },
      { n: "sem molho",   p: 0 }
    ]
  },

  refri: {
    titulo: "Qual sabor?",
    tipo: "unica",
    obrigatorio: true,
    opcoes: [
      { n: "Coca-Cola",   p: 0 },
      { n: "Guaraná",     p: 0 },
      { n: "Fanta Laranja", p: 0 },
      { n: "Guaraná Baré",  p: 0 }
    ]
  }

};


/* ==========================================================================
   7 · CARDÁPIO
   --------------------------------------------------------------------------
   Cada produto é uma linha:

     { n:"Nome", d:"Descrição", p:24.90, img:"img/foto.jpg" }

       n      nome
       d      descrição (o que vem no lanche)
       p      preço — use PONTO, não vírgula:  24.90
       img    foto do produto
       e      emoji, no lugar da foto, pra quando não tem imagem ainda
       de     preço antigo, riscado — vira uma promoção. ex:  de: 32.00
       tag    selinho no canto da foto. ex:  tag:"Mais pedido"
       extras lista de grupos da seção 6. ex:  extras:["ponto","turbina"]
       fav    true → também aparece no carrossel "Mais pedidos" lá em cima

   Pra tirar um produto, apague a linha inteira.
   Pra adicionar, copie uma linha e mude os dados.
   ========================================================================== */

const CARDAPIO = [

  {
    id:  "artesanais",
    cat: "Artesanais",
    tag: "Carne 180g · pão brioche",
    itens: [
      { n: "Clássico da Casa", d: "Pão brioche, carne 180g, queijo prato derretido, alface, tomate e maionese verde da casa.",
        p: 26.90, e: "🍔", fav: true, extras: ["ponto", "turbina", "tirar"] },

      { n: "Cheddar Bacon", d: "Pão brioche, carne 180g, cheddar cremoso, bacon crocante e cebola caramelizada.",
        p: 32.90, de: 37.90, e: "🥓", tag: "Mais pedido", fav: true, extras: ["ponto", "turbina", "tirar"] },

      { n: "Salada Completo", d: "Carne 180g, presunto, mussarela, ovo, alface, tomate, milho e batata palha.",
        p: 29.90, e: "🥬", extras: ["ponto", "turbina", "tirar"] },

      { n: "Duplo Monstro", d: "Duas carnes de 180g, quatro fatias de cheddar, bacon, picles e molho especial. Vai com fome.",
        p: 45.90, e: "🍔", tag: "Pra dividir", fav: true, extras: ["ponto", "turbina", "tirar"] },

      { n: "Frango Crocante", d: "Filé de frango empanado na hora, cheddar, alface americana e molho ranch.",
        p: 28.90, e: "🍗", extras: ["turbina", "tirar"] }
    ]
  },

  {
    id:  "combos",
    cat: "Combos",
    tag: "Lanche + batata + bebida",
    itens: [
      { n: "Combo Clássico", d: "Clássico da Casa + batata frita média + refrigerante lata.",
        p: 38.90, de: 44.80, e: "🍟", tag: "Economize R$ 6", fav: true, extras: ["ponto", "refri", "tirar"] },

      { n: "Combo Cheddar Bacon", d: "Cheddar Bacon + batata com cheddar e bacon + refrigerante lata.",
        p: 46.90, e: "🍟", extras: ["ponto", "refri", "tirar"] },

      { n: "Combo Casal", d: "2 Clássicos + batata grande + 2 refrigerantes lata.",
        p: 74.90, de: 85.00, e: "❤️", extras: ["ponto", "refri"] }
    ]
  },

  {
    id:  "porcoes",
    cat: "Porções",
    tag: "Pra acompanhar ou dividir",
    itens: [
      { n: "Batata Frita", d: "Porção generosa, sequinha, com sal de ervas da casa.", p: 18.90, e: "🍟" },
      { n: "Batata com Cheddar e Bacon", d: "Batata frita coberta de cheddar cremoso e bacon em cubos.", p: 26.90, e: "🧀", fav: true },
      { n: "Frango a Passarinho", d: "500g de frango frito no alho e óleo, com limão.", p: 34.90, e: "🍗" },
      { n: "Anéis de Cebola", d: "8 unidades empanadas na hora, com molho barbecue.", p: 19.90, e: "🧅" }
    ]
  },

  {
    id:  "bebidas",
    cat: "Bebidas",
    tag: "Bem geladas",
    compacto: true,
    itens: [
      { n: "Refrigerante lata 350ml", p: 6.00, extras: ["refri"] },
      { n: "Refrigerante 2 litros",   p: 14.00, extras: ["refri"] },
      { n: "Suco natural 500ml",      p: 9.00 },
      { n: "Água mineral 500ml",      p: 4.00 },
      { n: "Cerveja long neck",       p: 10.00 }
    ]
  },

  {
    id:  "sobremesas",
    cat: "Sobremesas",
    tag: "Pra fechar bem",
    compacto: true,
    itens: [
      { n: "Milk shake 400ml",       p: 16.90 },
      { n: "Brownie com sorvete",    p: 15.90 },
      { n: "Petit gâteau",           p: 18.90 }
    ]
  }

];


/* ==========================================================================
   MODO DEMONSTRAÇÃO
   --------------------------------------------------------------------------
   Com true, aparece um botãozinho 🎨 no canto da tela pra trocar a paleta
   ao vivo. Use na reunião: mostre as 6 opções e deixe o dono escolher.
   Depois de fechar, ponha a paleta escolhida no TEMA e mude aqui pra false.
   ========================================================================== */

const DEMO = true;
