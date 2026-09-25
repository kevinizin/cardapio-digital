const people = (n: number) => (n === 1 ? '1 pessoa' : `${n} pessoas`);

/**
 * Onde a reserva está: uma mesa comum (nome = identificação) ou uma área
 * compartilhada controlada por lugares (nome = "Salão", "Terraço").
 */
export interface Place {
  id: string;
  name: string;
  shared: boolean;
}
const mesa = (p: Place) => (p.shared ? p.name : `mesa ${p.name}`);
const Mesa = (p: Place) => (p.shared ? p.name : `Mesa ${p.name}`);
const daMesa = (p: Place) => (p.shared ? `do ${p.name}` : `da mesa ${p.name}`);
const naMesa = (p: Place) => (p.shared ? `no ${p.name}` : `na mesa ${p.name}`);

export const adminCore = {
  layout: {
    title: 'Administração',
    navLabel: 'Seções da administração',
    nav: {
      overview: 'Visão geral',
      agenda: 'Agenda',
      floor: 'Salão',
      reservations: 'Reservas',
      monthly: 'Dashboard mensal',
      settings: 'Configurações',
    },
    demoNote: 'Painel aberto para demonstração, sem login. Uma versão real exigiria autenticação administrativa.',
  },
  actions: {
    newReservation: 'Nova reserva',
    details: 'Detalhes',
    edit: 'Editar',
    changeTable: 'Trocar mesa',
    changeArea: 'Mudar de área',
    arrive: 'Registrar chegada',
    complete: 'Concluir atendimento',
    endPrep: 'Concluir preparação',
    extendPrep: 'Estender preparação',
    cancel: 'Cancelar reserva',
    noShow: 'Marcar ausência',
    blockTable: 'Bloquear mesa',
    openAgenda: 'Ver na agenda',
    moreActions: 'Mais ações',
  },
  drawer: {
    title: (name: string) => `Reserva de ${name}`,
    code: 'Código',
    date: 'Data',
    planned: 'Horário previsto',
    plannedValue: (start: string, end: string, prepEnd: string) => `${start}–${end} · preparação até ${prepEnd}`,
    people: 'Pessoas',
    table: 'Mesa',
    tableValue: (id: string, area: string, capacity: number) => `${id} · ${area} · ${capacity} lugares`,
    area: 'Área',
    areaValue: (area: string, capacity: number) => `${area} · ${capacity} lugares ao mesmo tempo`,
    durations: 'Duração salva',
    durationsValue: (service: string, prep: string) => `${service} de atendimento + ${prep} de preparação`,
    source: 'Origem',
    createdAt: 'Criada em',
    email: 'E-mail',
    phone: 'Telefone',
    notes: 'Observação',
    noValue: 'Não informado',
    realTitle: 'Registro real',
    seatedAt: 'Chegada',
    completedAt: 'Conclusão',
    prepEnd: 'Fim da preparação',
    prepExtension: (minutes: number) => `inclui extensão de ${minutes} min`,
    cancelledBy: 'Cancelada por',
    cancelledAt: 'Cancelada em',
    reason: 'Motivo',
    noShowAt: 'Ausência registrada em',
    late: (minutes: number) => `${minutes} min após o horário previsto`,
    overdue: (minutes: number) => `Atendimento ${minutes} min além do término previsto`,
    prepActive: (time: string, shared = false) => `${shared ? 'Lugares em preparação' : 'Mesa em preparação'} até ${time}`,
    noShowFrom: (time: string) => `Ausência disponível a partir das ${time}.`,
    notFound: 'Reserva não encontrada.',
    lockedEdit: 'Reservas concluídas, canceladas ou com ausência ficam registradas e não podem ser editadas.',
  },
  dialogs: {
    arriveTitle: 'Registrar chegada?',
    arriveText: (name: string, place: Place, time: string) => `${name} · ${mesa(place)} · reserva às ${time}.`,
    arriveConfirm: 'Registrar chegada',
    arriveBlockedTitle: 'Chegada não registrada',
    arriveBlockedHint: 'Use "Trocar mesa" para acomodar o cliente em outra mesa livre agora.',
    arriveBlockedHintShared: 'Use "Mudar de área" para acomodar o grupo em outra área com lugares livres agora.',
    completeTitle: 'Concluir atendimento?',
    completeText: (place: Place, prep: string, until: string) =>
      place.shared
        ? `Os lugares do grupo ${naMesa(place)} ficam em preparação por ${prep}, até ${until}, e depois voltam a ficar livres.`
        : `A mesa ${place.name} entra em preparação por ${prep}, até ${until}, e só então fica livre.`,
    completeConfirm: 'Concluir atendimento',
    endPrepTitle: (shared = false) => (shared ? 'Liberar os lugares antes do previsto?' : 'Liberar a mesa antes do previsto?'),
    endPrepText: (place: Place, until: string) =>
      place.shared
        ? `A preparação dos lugares ${naMesa(place)} estava prevista até ${until}. Ao confirmar, os lugares ficam livres imediatamente.`
        : `A preparação da mesa ${place.name} estava prevista até ${until}. Ao confirmar, a mesa fica livre imediatamente.`,
    endPrepConfirm: (shared = false) => (shared ? 'Liberar lugares agora' : 'Liberar mesa agora'),
    extendTitle: 'Estender preparação',
    extendText: (place: Place, until: string) => `Preparação ${daMesa(place)} prevista até ${until}.`,
    extendMinutes: 'Minutos adicionais',
    extendReason: 'Motivo',
    extendReasonHint: 'Obrigatório. Fica registrado no histórico da reserva.',
    extendPreview: (until: string) => `Novo término previsto: ${until}.`,
    extendConfirm: 'Estender preparação',
    cancelTitle: 'Cancelar reserva?',
    cancelText: (name: string, date: string, time: string) =>
      `A reserva de ${name} (${date} às ${time}) será cancelada e o horário ficará livre. Esta ação não pode ser desfeita.`,
    cancelReason: 'Justificativa',
    cancelReasonHint: 'Obrigatória. Fica registrada no histórico.',
    cancelConfirm: 'Cancelar reserva',
    noShowTitle: 'Marcar ausência?',
    noShowText: (name: string, time: string, tolerance: number) =>
      `${name} não chegou para a reserva das ${time} e a tolerância de ${tolerance} min terminou. O horário será liberado.`,
    noShowConfirm: 'Marcar ausência',
    changeTableTitle: 'Trocar mesa',
    changeTableText: (partySize: number, period: string) =>
      `${people(partySize)} · período ${period}. Aparecem apenas mesas ativas que comportam o grupo.`,
    tableCurrent: 'mesa atual',
    tableFree: 'livre no período',
    tableBusy: 'ocupada no período',
    changeTableConfirm: 'Trocar mesa',
    noOtherTables: 'Nenhuma outra mesa ativa comporta esse grupo.',
    chooseTable: 'Escolha a nova mesa',
    changeAreaTitle: 'Mudar de área',
    changeAreaText: (partySize: number, period: string) =>
      `${people(partySize)} · período ${period}. A nova área precisa ter lugares para o grupo durante todo o período.`,
    areaCurrent: 'área atual',
    areaFree: (free: number) => (free === 1 ? '1 lugar livre no período' : `${free} lugares livres no período`),
    areaFull: 'sem lugares suficientes',
    noOtherAreas: 'Nenhuma outra área ativa comporta esse grupo.',
    chooseArea: 'Escolha a nova área',
  },
  toasts: {
    arrived: (name: string) => `Chegada registrada: ${name}.`,
    completed: (place: Place, until: string) =>
      place.shared
        ? `Atendimento concluído. Lugares ${naMesa(place)} em preparação até ${until}.`
        : `Atendimento concluído. Mesa ${place.name} em preparação até ${until}.`,
    prepEnded: (place: Place) => (place.shared ? `Lugares liberados ${naMesa(place)}.` : `Mesa ${place.name} liberada.`),
    prepExtended: (place: Place, until: string) => `Preparação ${daMesa(place)} estendida até ${until}.`,
    cancelled: 'Reserva cancelada e horário liberado.',
    noShow: 'Ausência registrada e horário liberado.',
    tableChanged: (from: Place, to: Place) =>
      from.shared || to.shared ? `Área alterada: ${Mesa(from)} → ${Mesa(to)}.` : `Mesa trocada: ${from.name} → ${to.name}.`,
    created: (code: string) => `Reserva ${code} criada.`,
    updated: 'Reserva atualizada.',
    noChanges: 'Nenhuma alteração para salvar.',
    saved: 'Alterações salvas.',
    blockCreated: 'Bloqueio criado.',
    blockRemoved: 'Bloqueio removido.',
    blockEnded: 'Bloqueio encerrado agora.',
    restored: 'Demonstração restaurada com novos dados fictícios.',
    exported: 'Arquivo gerado para download.',
    memoryOnly: 'Atenção: a alteração ficou apenas em memória nesta aba.',
    warningsTitle: 'Atenção',
  },
  form: {
    createTitle: 'Nova reserva',
    editTitle: (code: string) => `Editar reserva ${code}`,
    date: 'Data',
    dateHint: 'Formato dd/mm/aaaa.',
    time: 'Horário de início',
    timeHint: 'Horários de Paris dentro dos turnos do dia.',
    noShifts: 'O restaurante não abre nessa data.',
    partySize: 'Pessoas',
    table: 'Mesa',
    tableAuto: 'Automática (menor mesa livre)',
    area: 'Área',
    tableOrArea: 'Mesa ou área',
    areaAuto: 'Automática (primeira área com lugares)',
    autoMixed: 'Automática (menor mesa livre ou área com lugares)',
    areaOption: (area: string, capacity: number, note: string) => `${area} · ${capacity} lugares ao mesmo tempo — ${note}`,
    areaFree: (free: number) => (free === 1 ? '1 lugar livre' : `${free} lugares livres`),
    areaFull: 'sem lugares suficientes no período',
    tableOption: (id: string, capacity: number, area: string, note: string) => `${id} · ${capacity} lugares · ${area} — ${note}`,
    tableFree: 'livre',
    tableBusy: 'ocupada no período',
    tableSmall: 'pequena para o grupo',
    tableInactive: 'desativada',
    serviceMinutes: 'Atendimento (min)',
    prepMinutes: 'Preparação (min)',
    durationHint: (service: number, prep: number) => `Padrão atual: ${service} + ${prep} min. O valor fica salvo nesta reserva.`,
    source: 'Origem',
    name: 'Nome do cliente',
    email: 'E-mail',
    emailHint: 'Obrigatório para reservas de origem online.',
    phone: 'Telefone',
    notes: 'Observação',
    now: 'Agora (presencial)',
    submitCreate: 'Criar reserva',
    submitEdit: 'Salvar alterações',
    seatedLock: 'Cliente presente: data, horário e durações ficam travados. Mesa ou área, pessoas e contato podem ser ajustados.',
    preview: (start: string, end: string, prepEnd: string, shared = false) =>
      `Atendimento ${start}–${end}; ${shared ? 'lugares ocupados' : 'mesa ocupada'} até ${prepEnd}, com a preparação.`,
    invalidDate: 'Informe uma data válida no formato dd/mm/aaaa.',
  },
  alerts: {
    title: 'Alertas operacionais',
    none: 'Nenhum alerta no momento.',
    severity: { critical: 'Crítico', warning: 'Atenção', info: 'Aviso' },
    late_arrival: (name: string, place: Place, minutes: number) =>
      `${name} (${mesa(place)}) está ${minutes} min após o horário, ainda dentro da tolerância.`,
    tolerance_exceeded: (name: string, place: Place, minutes: number) =>
      `${name} (${mesa(place)}) está ${minutes} min após o horário e a tolerância terminou. Registre a chegada ou marque ausência.`,
    overstay: (name: string, place: Place, minutes: number) =>
      `${Mesa(place)} (${name}): atendimento ${minutes} min além do término previsto.`,
    areaCritical: (area: string, people: number, capacity: number, time: string) =>
      `${area}: previsão de ${people} pessoas para ${capacity} lugares a partir das ${time}, porque há clientes além do horário. Considere mudar de área uma das próximas reservas.`,
    areaWarning: (area: string, people: number, capacity: number, time: string) =>
      `${area} pode chegar a ${people} pessoas para ${capacity} lugares às ${time} se os clientes além do horário continuarem.`,
    nextWarning: (table: string, freeAt: string, nextTime: string, nextName: string) =>
      `Mesa ${table} deve liberar às ${freeAt}, perto da próxima reserva (${nextTime}, ${nextName}).`,
    nextCritical: (table: string, freeAt: string, nextTime: string, nextName: string) =>
      `Mesa ${table} só deve liberar às ${freeAt}, depois do início da próxima reserva (${nextTime}, ${nextName}). Considere trocar a mesa da próxima reserva.`,
    pending: (count: number) =>
      count === 1
        ? '1 reserva passada ainda está como confirmada. Atualize a situação (ausência ou cancelamento com justificativa).'
        : `${count} reservas passadas ainda estão como confirmadas. Atualize a situação (ausência ou cancelamento com justificativa).`,
    reviewPending: 'Ver pendentes',
    open: 'Abrir reserva',
    openNext: 'Abrir próxima reserva',
    noAutomaticChanges: 'Alertas não alteram reservas: nada é deslocado, concluído ou cancelado automaticamente.',
  },
  conflicts: {
    title: 'Reservas que precisam de ajuste',
    row: (name: string, date: string, time: string, place: Place, partySize: number) =>
      `${date} às ${time} · ${name} · ${mesa(place)} · ${people(partySize)}`,
    open: 'Abrir',
  },
};
