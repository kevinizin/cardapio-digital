# Maison Élise — planejamento da demonstração
Atualizado em 14/09/2026.

## Objetivo e instruções do usuário
Preparar uma demonstração fictícia de um sistema completo de reservas de mesas para apresentar à dona de um restaurante em Paris. O entregável posterior será um prompt detalhado para o Claude implementar o sistema, acompanhado da logo e da paleta.
Neste momento estamos planejando, não implementando o sistema. Pagamento, mensalidade e proposta comercial ficam para depois. Se necessário, o usuário disponibilizou sua Vercel para hospedar a demonstração; ainda não houve publicação.

## Requisitos solicitados
- Interface da dona com reservas, clientes, mesas e disponibilidade em uma data e horário.
- Interface do cliente para consultar dias e horários disponíveis e reservar.
- Intervalo de preparação da mesa após cada atendimento, indisponível para reserva.
- Histórico suficiente para dashboard mensal de reservas e pessoas.
- Dados inteiramente fictícios para apresentação.

## Premissas sugeridas para a demonstração
Estas são propostas de trabalho, não decisões expressamente confirmadas pelo usuário.
- Restaurante Maison Élise, Paris, com 12 mesas e funcionamento no almoço e jantar.
- Atendimento previsto de 90 minutos, seguido de 20 minutos de preparação.
- Inícios de reserva a cada 15 minutos.
- Três meses de histórico fictício.
- Cliente informa quantidade de pessoas e horário; sistema atribui mesa adequada automaticamente. Escolha da mesa pelo cliente ainda não foi decidida.
- Cliente sem cadastro obrigatório, com código para consultar e cancelar a reserva.
- Confirmações por e-mail apenas simuladas.
- Fuso Europe/Paris, incluindo mudanças sazonais de horário.
- Idioma inicial e eventual alternância entre português e francês ainda precisam ser definidos.

## Interface do cliente
1. Escolher data e quantidade de pessoas.
2. Consultar horários com mesa de capacidade suficiente.
3. Informar nome, contato e observações opcionais.
4. Revisar e confirmar.
5. Receber resumo e código de consulta.
6. Consultar ou cancelar a reserva.
Não expor nomes, contatos ou reservas de outros clientes. Tratar falta de horários, dias fechados, dados inválidos e horário que ficou indisponível durante a confirmação.

## Interface da dona
- Agenda diária, lista pesquisável e mapa das mesas.
- Consulta de data e horário futuros.
- Detalhes da reserva: cliente, pessoas, mesa, início, término previsto, observações e status.
- Registrar chegada, concluir atendimento, cancelar ou marcar ausência.
- Cadastrar reserva manual recebida por telefone.
- Trocar mesa, validando capacidade e conflitos.
- Bloquear mesas e períodos manualmente.
- Configurar funcionamento, dias fechados e duração de atendimento e preparação.

## Regras de disponibilidade
- Uma reserva só cabe se todo o atendimento e a preparação couberem no período permitido, conforme regra de fechamento a estabelecer.
- Bloquear o intervalo do início até o fim da preparação.
- Exemplo: atendimento 19h–20h30, preparação até 20h50; próximo início oferecido às 21h por causa dos intervalos de 15 minutos.
- Intervalos adjacentes são permitidos: uma reserva pode começar exatamente quando termina o bloqueio anterior.
- Revalidar a disponibilidade ao confirmar e ao editar.
- Não permitir reserva no passado, grupo acima da capacidade ou conflito com bloqueio manual.
- Alterações nas configurações não devem invalidar reservas existentes silenciosamente.
- Distinguir previsão e situação real: atendimento atrasado gera alerta sobre a próxima reserva; não mover ou cancelar automaticamente outra reserva.
- Finalização antecipada pode iniciar a preparação antes, mas a liberação exige validar reservas futuras.
- Preparação é situação da mesa, não status do atendimento do cliente.
- Regras para tolerância de atraso, junção de mesas, duração por tamanho do grupo, cancelamento e antecedência máxima ainda precisam ser especificadas.

## Estados
Reserva: confirmada → cliente chegou → concluída.
Alternativas: cancelada ou ausência.
Mesa no momento consultado: livre, reservada, ocupada, em preparação ou bloqueada.
A interface deve distinguir estado atual de disponibilidade futura e usar texto/ícones além de cores.

## Armazenamento
Não apagar reservas concluídas ao finalizar o atendimento.
Manter data, quantidade de pessoas, mesa, duração e resultado para relatórios.
Entidades previstas: mesas, regras de funcionamento, reservas, dados de contato necessários e bloqueios.
A demonstração pode usar armazenamento local do navegador, com dados fictícios persistentes e opção explícita de restaurar os exemplos. Isso não sincroniza dispositivos e não oferece proteção real para dados administrativos.
Caso seja necessário mostrar celular e computador sincronizados, usar armazenamento compartilhado. Hospedar apenas a interface na Vercel não resolve a sincronização.
Na versão real, o servidor e o banco precisam impedir reservas concorrentes da mesma mesa de forma atômica; a validação apenas na interface é insuficiente.
Retenção e anonimização de dados pessoais serão definidas para uma versão real, preservando estatísticas necessárias.

## Dashboard
- Reservas criadas no mês.
- Reservas com atendimento previsto no mês.
- Pessoas previstas.
- Pessoas efetivamente atendidas.
- Cancelamentos e ausências.
- Dias e horários mais procurados.
- Ocupação por turno, com definição explícita do cálculo.
Separar data de criação e data do atendimento. Uma reserva criada em setembro para outubro conta como recebida em setembro e prevista para outubro.
Separar reservas de pessoas: uma reserva de quatro lugares equivale a uma reserva e quatro pessoas.
Usar datas no fuso de Paris e filtros coerentes. Cancelamentos e ausências não contam como pessoas atendidas.

## Critérios para o futuro prompt do Claude
- Entregar demonstração navegável e funcional, com as duas interfaces usando a mesma fonte de dados.
- Layout responsivo para celular, tablet e computador.
- Aplicar a logo existente, sem redesenhar ou substituir por emoji.
- Identificar claramente o ambiente como demonstração com dados fictícios.
- Todos os botões principais devem funcionar; mensagens externas serão explicitamente simuladas.
- Dados de exemplo coerentes com capacidade, horários e intervalos de preparação.
- Prever estados vazios, erros de validação, confirmações e retorno visual após ações.
- Navegação por teclado, rótulos nos campos, foco visível e contraste legível.
- Validar cenários de conflito, limites de horários, cancelamento, preparação, edição e consistência do dashboard.
- Não integrar pagamentos nem enviar mensagens reais.
- Não afirmar que armazenamento local é uma solução de produção.
- Definir a tecnologia e o modo de armazenamento no prompt final, antes da implementação.

## Arquivos da identidade
Logo: identidade/logo-maison-elise.png
Referência original: identidade/referencia-visual.md

# Maison Élise — identidade fictícia

Logo criada com a ferramenta integrada de geração de imagens, em PNG com fundo claro.

## Paleta normativa para a interface
- Verde profundo: #183D35 — botões principais, títulos e navegação.
- Creme: #F7F3EA — fundo principal.
- Dourado suave: #B89B63 — detalhes decorativos, não texto pequeno sobre creme.
- Sálvia: #DCE5DC — superfícies secundárias.
- Carvão: #252B28 — texto corrido.

As cores HEX são a referência de implementação; a imagem gerada pode apresentar pequenas variações.

## Prompt original
Use case: logo-brand. Create a refined original fictional Paris restaurant logo for "Maison Élise", with the smaller exact text "PARIS" below. One single finished logo, not a brand presentation sheet. Warm French bistro elegance, restrained contemporary heritage style. Custom elegant serif wordmark, impeccably readable accented Élise. Above the wordmark a compact original monogram ME in a simple architectural arch suggesting a Parisian restaurant doorway, subtle small gold detail. Flat crisp vector-like artwork, no photographic mockup, no shadows, no gradients, no watermark, no extra text or palette swatches. Centered balanced composition, generous but not excessive margins, landscape 3:2 canvas. Solid warm ivory background #F7F3EA; principal lettering and emblem deep forest green #183D35; restrained matte champagne gold accent #B89B63. Suitable for reservation website header and restaurant identity. Lettering should be substantial enough for small screens, understated and welcoming, avoid ornate flourishes and Eiffel Tower clichés.

## Prompt de refinamento final
Edit this logo: retain the exact Maison Élise and PARIS text and architectural ME monogram composition. Correct the background to a completely uniform opaque light ivory #F7F3EA covering every pixel behind the logo. All lettering and arch must be solid dark forest green #183D35, clearly readable with strong contrast. Small fleur-de-lis and horizontal rules in flat muted gold #B89B63. Remove ALL glow, shadows, gradients, black areas and lighting effects. Flat ink on ivory, crisp clean graphic logo.



