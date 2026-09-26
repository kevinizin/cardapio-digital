# Aromas da Vivi — referência visual

Restaurante brasileiro em Paris. A interface de reservas segue as cores do logo oficial.

## Logo

- **Arquivo oficial: pendente.** O logo existe só como imagem de referência: "Aromas" em script cursivo dourado metálico, com um pequeno chapéu de chef sobre o "o"; embaixo, à direita, "da Vivi" em script dourado menor, com um brilho; tudo sobre fundo bordô (~#841731).
- Até o arquivo chegar, `app/src/components/Brand.tsx` desenha um **logotipo provisório** em SVG (fonte Great Vibes, dourado em degradê sobre um cartão bordô), nas variantes header, hero, footer e sidebar.
- Para trocar pelo arquivo oficial: coloque a imagem em `app/public/brand/` (de preferência WebP + PNG, com fundo bordô ou transparente) e defina `LOGO_IMAGE` em `Brand.tsx` com o caminho, por exemplo `'/brand/logo-aromas-da-vivi.webp'`.
- Ícones do navegador (`app/public/brand/icon-32/180/192/512.png` e `app/public/favicon.ico`) também são provisórios: um "A" em script dourado sobre bordô. Devem ser refeitos a partir do arquivo oficial.

## Paleta normativa para a interface

| Papel | Cor | Uso |
| --- | --- | --- |
| Bordô (marca) | `#841731` | Botões principais, títulos, navegação, fundo do logo |
| Bordô escuro | `#5C0F22` | Hover de botões principais |
| Bordô — degraus claros | `#93213E` · `#A3304D` · `#B24A63` | Links, foco, bordas de controles |
| Bordô — tintas | `#ECCCD3` · `#F8E8EB` | Seleção, selos |
| Dourado metálico | `#C9A24A` | Só decorativo (filetes, marcadores, letras do logo); nunca texto pequeno sobre creme |
| Dourado escuro (texto) | `#7A5C1C` | Único dourado permitido em texto |
| Dourado — tintas | `#E6CF8F` · `#F6EDD6` | Realces, fundo de selos |
| Creme | `#F8F3EA` | Fundo principal |
| Rosado | `#F3E2E3` · `#FAF0F0` · borda `#E4C6CB` | Superfícies secundárias (faixa de aviso, chamadas, item ativo) |
| Carvão | `#2A2224` | Texto corrido |

Degradê do dourado (logo): `#F7E2A3 → #E0BF6C → #C9A24A → #A8822F → #E8CD82`.

As cores de estado das mesas e reservas (livre verde, reservada azul, ocupada tijolo, preparo âmbar, bloqueada/inativa cinza) continuam separadas da marca. Para não se confundir com o bordô, **ausência** passou a violeta (`#5B3D82` sobre `#ECE6F4`) e **perigo** a vermelho-alaranjado (`#A3321A`, hover `#852611`, fundo `#FBE7DF`).

## Contraste (WCAG AA)

Pares verificados com script (mínimo 4,5:1 texto, 3:1 texto grande/elementos de interface):

- Carvão sobre creme: 14,05:1 · bordô sobre creme: 8,85:1 · bordô sobre rosado: 7,82:1
- Creme claro sobre botão bordô: 9,62:1 (hover 13,36:1) · links `#93213E` sobre creme: 7,52:1
- Dourado escuro `#7A5C1C` sobre creme: 5,63:1 · sobre `#F6EDD6`: 5,33:1
- Dourado `#C9A24A` sobre bordô (letras do logo, texto grande): 4,07:1
- Borda `#B24A63` sobre branco: 5,10:1 · foco `#A3304D` sobre creme: 6,15:1
- Branco sobre botão de perigo: 6,93:1 · todos os selos de estado ≥ 5,10:1

## Tipografia

- Títulos: Cormorant Garamond. Corpo: Source Sans 3. Logo provisório: Great Vibes.
