# Aromas da Vivi · Sistema de reservas

Sistema de reservas de mesas do restaurante **Aromas da Vivi**, em Paris. Tem duas interfaces sobre a mesma fonte de dados:

- **Site do cliente**: página inicial, reserva em 4 etapas, confirmação com código e consulta/cancelamento.
- **Administração** (`/admin`, com senha): visão geral do dia, agenda por mesa, mapa do salão, reservas, dashboard mensal e configurações.

Há dois modos:

| Modo | Onde os dados ficam | Para quê |
|---|---|---|
| **Real** (padrão) | Postgres no servidor (`server/`), compartilhado entre todos os aparelhos | O restaurante funcionando |
| **Demonstração** (`VITE_DATA_MODE=demo`) | `localStorage` de cada navegador, com dados fictícios | Apresentar o sistema a novos clientes |

---

## Versão real: publicar no Railway

O servidor (`server/`) entrega o site e a API na mesma origem. Ele usa as mesmas regras de negócio do site (`src/domain`) para validar e gravar cada reserva dentro de uma transação, o que impede duas reservas na mesma mesa e horário.

1. No Railway, crie um projeto e adicione um banco **PostgreSQL** (New → Database → PostgreSQL).
2. Adicione um serviço a partir do repositório do GitHub (New → GitHub Repo) e, em **Settings**:
   - **Root Directory** = `app`
   - **Branch** = a branch que vai ao ar
   - Build e start já vêm de `railway.json` (`npm run build` / `npm start`, healthcheck em `/api/health`).
3. Em **Variables** do serviço:

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referência ao banco do projeto) |
   | `ADMIN_PASSWORD` | senha da equipe para entrar em `/admin` (mínimo 8 caracteres) |
   | `SESSION_SECRET` | texto aleatório de 32+ caracteres (ex.: `openssl rand -hex 32`) |
   | `NODE_ENV` | `production` (cookie de sessão só por HTTPS) |

4. Em **Settings → Networking**, gere um domínio público (ou ligue um domínio próprio).
5. Na primeira inicialização o servidor cria as tabelas e o documento inicial (configurações e mesas, **sem reservas**). Ajuste mesas e horários em **/admin → Configurações**.

**Segurança e privacidade**
- O site do cliente só recebe horários ocupados: nomes, e-mails, telefones, observações e códigos das reservas nunca saem do servidor sem login.
- Consulta e cancelamento exigem código + e-mail, com limite de tentativas por IP; reservas online também têm limite por IP.
- Login da administração com cookie `HttpOnly` + `SameSite=Strict`, válido por 12 h, e no máximo 10 tentativas a cada 15 min.
- Trocar a senha: altere `ADMIN_PASSWORD` no Railway. Para derrubar todas as sessões abertas, troque também `SESSION_SECRET`.

**Cópias de segurança**
- Toda gravação guarda uma cópia completa na tabela `app_state_history` (revisão + data/hora). Para voltar a uma versão: copie o `data` da revisão desejada para `app_state` (e ajuste `revision` para um número maior que o atual).
- Em **/admin → Configurações → Dados** há exportação em JSON, e em **Reservas** a exportação em CSV.

**Como funciona a sincronização**
- A administração aplica cada ação na hora e salva em seguida, informando a revisão em que se baseou. Se outra pessoa salvou antes, a ação é refeita sobre a versão nova; se não fizer mais sentido (ex.: reserva já cancelada), é descartada com aviso.
- Sem internet, as ações ficam pendentes ("Sem conexão") e são reenviadas automaticamente.
- Outros aparelhos recebem as novidades em até 20 segundos.

**Rodar a versão real no computador**

```bash
# precisa de um Postgres local
export DATABASE_URL=postgres://usuario@localhost:5432/reservas
export ADMIN_PASSWORD=uma-senha-local SESSION_SECRET=$(openssl rand -hex 32)
npm run build && npm start   # http://localhost:3000
```

Testes do banco (use um banco descartável, as tabelas são recriadas): `TEST_DATABASE_URL=postgres://… npm run test:db`.

## Requisitos

- Node.js 20.19 ou mais recente (testado com Node 24) e npm.
- Modo demonstração: não é preciso chave, conta ou serviço externo.
- Modo real: um banco PostgreSQL (no Railway ou local).

## Como instalar e rodar

Na pasta `app`:

```bash
npm install
VITE_DATA_MODE=demo npm run dev
```

`npm run dev` sem a variável abre o modo real, que precisa do servidor da API rodando.

Abra o endereço mostrado no terminal (normalmente http://localhost:5173). Se a porta 5173 estiver ocupada, o Vite usa a próxima livre e mostra o endereço; nenhum processo de outro projeto é encerrado.

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm test` | Roda os testes (Vitest), de propósito num fuso diferente de Paris (America/Sao_Paulo) |
| `npm run typecheck` | Verificação de tipos (TypeScript) |
| `npm run build` | Verificação de tipos + build do site em `dist/` e do servidor em `dist-server/` |
| `npm start` | Servidor de produção (precisa das variáveis acima) |
| `npm run test:db` | Testes contra um Postgres descartável (`TEST_DATABASE_URL`) |
| `npm run preview` | Serve o build de `dist/` localmente (porta 4173 ou a próxima livre) |

As dependências estão fixadas em versões exatas no `package.json` e no `package-lock.json`.

## Rotas

**Cliente**

| Rota | Tela |
|---|---|
| `/` | Página inicial com horários, apresentação e acesso à reserva |
| `/reservar` | Reserva: pessoas e data → horário → dados → revisão |
| `/reserva/:codigo` | Confirmação (detalhes só no navegador que fez a reserva) |
| `/consultar` | Consulta por código e e-mail, com cancelamento |

**Administração** (botão discreto "Painel de demonstração" no topo)

| Rota | Tela |
|---|---|
| `/admin` | Visão geral do dia: previstas, pessoas, presentes, mesas livres, chegadas e alertas |
| `/admin/agenda` | Agenda por dia, filtros de turno/situação/área, linha do tempo por mesa e lista |
| `/admin/salao` | Mapa das 12 mesas: situação real agora ou previsão para data/hora futura |
| `/admin/reservas` | Busca, filtros, criação manual, detalhes, ações e exportação CSV |
| `/admin/mensal` | Dashboard mensal com indicadores e gráficos derivados dos registros |
| `/admin/configuracoes` | Regras, funcionamento semanal, exceções, mesas, bloqueios e dados |

As rotas funcionam com acesso direto (recarregar ou abrir o link), tanto no `npm run dev` quanto no build (`npm run preview` e Vercel, via `vercel.json`).

## Regras da demonstração

- 12 mesas: M01–M04 para 2 pessoas, M05–M10 para 4 e M11–M12 para 6 (44 lugares). M01–M08 no salão; M09–M12 na varanda coberta. Mesas não são combinadas.
- Terça a domingo: almoço 12h–15h e jantar 19h–23h; segunda fechado. Horários sempre de **Paris (Europe/Paris)**, com horário de verão, em 24 horas e datas dia/mês/ano.
- Atendimento de 90 min + preparação de 20 min, com início a cada 15 min. Atendimento e preparação precisam caber inteiros no turno.
- Online: grupos de 1 a 6 pessoas, antecedência mínima de 30 min, janela de hoje até 60 dias. Cancelamento pelo cliente até 2 horas antes.
- A mesa é atribuída automaticamente: a menor que comporte o grupo, com desempate pela identificação (M01, M02…). O cliente não escolhe mesa nem vê dados de outros clientes.
- Intervalos semiabertos `[início, fim)`: uma reserva pode começar exatamente quando termina a preparação anterior.
- Confirmadas e clientes presentes bloqueiam do início ao término previsto + preparação; quem está à mesa não é liberado só porque passou do horário previsto. Concluídas passam a considerar a preparação real. Cancelamentos e ausências liberam o período.
- Duração e preparação ficam salvas em cada reserva: mudar as configurações não altera reservas antigas.
- Chegada muito antecipada exige mesa livre naquele momento; ausência só após início + tolerância (15 min). Nada é concluído, deslocado ou marcado como ausência automaticamente: atrasos e atendimentos longos geram alertas.
- Configurações validam conflitos: fechar um dia, reduzir capacidade, desativar mesa ou criar bloqueio que afete reservas é recusado com a lista do que resolver.

## Dados fictícios

Na primeira abertura, o sistema gera uma única vez, a partir da data atual de Paris:

- três meses completos de histórico antes do mês atual, mais o mês atual;
- reservas futuras dentro da janela de 60 dias;
- mistura de concluídas (com horários reais coerentes), canceladas, ausências e confirmadas; origens online, telefone e presencial; grupos de 1 a 6 pessoas;
- dias de alta e de baixa ocupação, exceções (fechamento e horário especial) e bloqueios manuais;
- atendimentos em andamento, preparações e bloqueio atual **apenas se** o horário de Paris estiver dentro de um turno;
- reserva criada num mês para atendimento no seguinte.

Nomes e contatos são inventados; e-mails usam `example.com` e telefones usam a faixa francesa reservada para ficção (06 39 98 xx xx). A geração é determinística e sem conflitos (verificada nos testes).

As reservas passadas não mudam de situação sozinhas: se a demonstração ficar aberta por dias, reservas antigas ainda confirmadas aparecem como pendentes nos alertas.

## Restaurar e exportar

Em **Configurações → Dados da demonstração**:

- **Restaurar demonstração**: pede confirmação explícita e apaga **somente** as chaves desta aplicação (prefixo `maison-elise-demo:`), nunca todo o `localStorage`. Em seguida gera novos dados fictícios a partir de hoje.
- **Exportar dados (JSON)**: baixa todos os dados da demonstração.

Em **Reservas**, **Exportar CSV** baixa as reservas filtradas (separador `;`, UTF-8 com BOM, aspas escapadas e proteção contra fórmulas em planilhas).

## Armazenamento local e limitações

- Os dados ficam no `localStorage` **deste navegador**, com esquema versionado e validação ao carregar. **Outros dispositivos ou navegadores não compartilham os dados**: a reserva feita no celular não aparece no computador.
- Abas do mesmo navegador são sincronizadas pelo evento `storage`, e cada ação relê os dados salvos antes de validar. Isso reduz, mas **não elimina**, corridas entre abas: o `localStorage` não oferece transação atômica.
- Se o armazenamento estiver indisponível ou cheio, a demonstração continua **apenas em memória** e avisa na tela. Se os dados salvos estiverem corrompidos ou numa versão desconhecida, **nada é apagado**: há opção de baixar a cópia bruta ou restaurar a demonstração.
- A consulta por código e e-mail é apenas demonstrativa. Ela **não é autenticação segura**, e a administração é aberta sem login.

Uma versão de produção precisaria de: autenticação administrativa real, banco de dados compartilhado com prevenção transacional de conflitos no servidor, envio real de confirmações, política de retenção e privacidade dos dados pessoais (RGPD/LGPD), além de monitoramento e backups. **Nada disso foi implementado nesta demonstração.**

## Demonstração na Vercel

A Vercel publica apenas a **demonstração** (o `vercel.json` compila com `VITE_DATA_MODE=demo`).

Demonstração publicada em **https://maison-elise-demo.vercel.app** (projeto `maison-elise-demo`, escopo `kevinizins-projects`). Continua com `noindex` e `robots.txt` bloqueando indexação, por ser demonstração; remova isso apenas se virar um site real.

Para republicar depois de alterar o código, dentro de `app`:

```bash
vercel deploy --prod --scope kevinizins-projects
```

Para recriar o projeto do zero: **Root Directory** = `app`, framework **Vite**, build `npm run build`, output `dist` — tudo já definido em `vercel.json`, que também traz o fallback de SPA (acesso direto às rotas), cache longo para `/assets` e cabeçalhos básicos de segurança.

A versão publicada continua guardando dados no navegador de cada visitante: cada pessoa que abrir o link recebe a própria cópia dos dados fictícios, gerada no primeiro acesso, e nada é compartilhado entre aparelhos.
## Organização do código

```
src/
  domain/      regras puras e testáveis (agenda, disponibilidade, ciclo da reserva, métricas, dados fictícios)
  data/        repositório (localStorage), validação do esquema e store com sincronização entre abas
  i18n/        textos em pt-BR e formatação de datas/horas no fuso de Paris
  components/  componentes acessíveis (diálogos, calendário, campos, selos, gráfico)
  features/    telas do cliente (public) e da administração (admin)
  styles/      tokens da identidade, base, componentes e layout
```

As regras de negócio não conhecem o armazenamento: trocar o `localStorage` por uma API exige substituir apenas a camada `data/`.

## Identidade visual

- Logo: o arquivo oficial do Aromas da Vivi ainda está pendente. Até lá, `src/components/Brand.tsx` desenha um logotipo provisório em SVG (Great Vibes dourado sobre bordô); para usar a imagem, coloque-a em `public/brand/` e defina `LOGO_IMAGE` nesse arquivo. Os ícones do navegador (`public/brand/icon-*.png`, `public/favicon.ico`) são provisórios: um "A" em script dourado sobre bordô.
- Paleta: bordô `#841731`, dourado metálico `#C9A24A` (só decorativo; `#7A5C1C` em texto), creme `#F8F3EA`, rosado `#F3E2E3`, carvão `#2A2224`. Detalhes em `../identidade/referencia-visual.md`.
- Tipografia auto-hospedada (sem depender de rede): Cormorant Garamond nos títulos e Source Sans 3 no corpo.
