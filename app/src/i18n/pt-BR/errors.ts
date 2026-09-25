import type { ConflictInfo, DomainError, DomainWarning } from '../../domain/errors';
import type { DemoData } from '../../domain/types';
import { formatDateTime, formatDuration, formatTime } from '../format';
import { common } from './common';

const num = (value: string | number | undefined) => Number(value ?? 0);
const hoursText = (minutes: number) => (minutes % 60 === 0 ? `${minutes / 60} h` : formatDuration(minutes));

/** Mensagem legível para cada código de erro das regras. */
/** Nome da área (mesa compartilhada) quando o erro traz `area`. */
const areaName = (p: Record<string, string | number>) =>
  p.area ? (common.area[p.area as keyof typeof common.area] ?? String(p.area)) : '';

export function errorMessage(error: DomainError): string {
  const p = error.params ?? {};
  const area = areaName(p);
  switch (error.code) {
    case 'PARTY_SIZE_INVALID':
      return 'Informe a quantidade de pessoas.';
    case 'PARTY_ABOVE_ONLINE_LIMIT':
      return `Reservas online são para grupos de até ${p.max} pessoas.`;
    case 'PARTY_ABOVE_CAPACITY':
      return `Nenhuma mesa ou área ativa comporta esse grupo (até ${p.max} pessoas).`;
    case 'DATE_INVALID':
      return 'Informe uma data válida.';
    case 'TIME_INVALID':
      return 'Informe um horário válido no formato 24 horas.';
    case 'TIME_NONEXISTENT':
      return 'Esse horário não existe em Paris nessa data por causa da mudança para o horário de verão.';
    case 'DAY_PAST':
      return 'Essa data já passou.';
    case 'DAY_CLOSED':
      return 'O restaurante está fechado nessa data.';
    case 'BEYOND_WINDOW':
      return `As reservas ficam abertas para os próximos ${p.days} dias.`;
    case 'START_IN_PAST':
      return 'Esse horário já passou.';
    case 'MIN_ADVANCE':
      return `Reservas online precisam de pelo menos ${p.minutes} minutos de antecedência.`;
    case 'OFF_GRID':
      return `Os horários de início seguem intervalos de ${p.minutes} minutos.`;
    case 'OUTSIDE_SHIFT':
      return 'O atendimento e a preparação da mesa precisam caber inteiros dentro de um turno de funcionamento.';
    case 'SERVICE_DURATION_INVALID':
      return `A duração do atendimento deve ficar entre ${p.min} e ${p.max} minutos, em múltiplos de ${p.step}.`;
    case 'PREP_DURATION_INVALID':
      return `A preparação deve ficar entre ${p.min} e ${p.max} minutos, em múltiplos de ${p.step}.`;
    case 'TABLE_NOT_FOUND':
      return 'Mesa não encontrada.';
    case 'TABLE_INACTIVE':
      return area ? `A área ${area} está desativada.` : `A mesa ${p.table} está desativada.`;
    case 'TABLE_TOO_SMALL':
      return area
        ? `A área ${area} comporta ${p.capacity} pessoas ao mesmo tempo e o grupo tem ${p.partySize}.`
        : `A mesa ${p.table} comporta ${p.capacity} pessoas e o grupo tem ${p.partySize}.`;
    case 'CONFLICT':
      return area
        ? `A área ${area} não tem lugares suficientes para esse grupo em parte desse período (lotada ou bloqueada).`
        : `A mesa ${p.table} já está ocupada em parte desse período.`;
    case 'NO_TABLE_AVAILABLE':
      return 'Não há mesa livre nem lugares suficientes para esse grupo nesse horário.';
    case 'SLOT_UNAVAILABLE':
      return 'Esse horário acabou de ficar indisponível.';
    case 'NAME_REQUIRED':
      return 'Informe o nome.';
    case 'NAME_TOO_SHORT':
      return `O nome precisa ter pelo menos ${p.min} caracteres.`;
    case 'NAME_TOO_LONG':
      return `O nome pode ter até ${p.max} caracteres.`;
    case 'EMAIL_REQUIRED':
      return 'Informe o e-mail.';
    case 'EMAIL_INVALID':
      return 'Informe um e-mail válido, como nome@exemplo.com.';
    case 'EMAIL_TOO_LONG':
      return `O e-mail pode ter até ${p.max} caracteres.`;
    case 'PHONE_REQUIRED':
      return 'Informe um telefone para contato.';
    case 'PHONE_INVALID':
      return 'Use de 6 a 15 dígitos; são aceitos espaços e os símbolos + ( ) - .';
    case 'PHONE_TOO_LONG':
      return `O telefone pode ter até ${p.max} caracteres.`;
    case 'NOTES_TOO_LONG':
      return `A observação pode ter até ${p.max} caracteres.`;
    case 'SOURCE_INVALID':
      return 'Escolha uma origem válida.';
    case 'NETWORK_ERROR':
      return 'Não foi possível falar com o servidor. Verifique a internet e tente de novo.';
    case 'RATE_LIMITED':
      return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.';
    case 'SAVE_REJECTED':
      return 'A alteração não pôde ser salva porque os dados mudaram. A tela foi atualizada; confira e repita se ainda fizer sentido.';
    case 'NOT_FOUND':
      return 'Reserva não encontrada.';
    case 'NOT_EDITABLE':
      return 'Só é possível editar reservas confirmadas ou com cliente presente; com o cliente à mesa, dia, horário e durações não mudam.';
    case 'STATUS_NOT_ALLOWED':
      return `Ação indisponível para reservas com situação "${common.reservationStatus[p.status as keyof typeof common.reservationStatus] ?? p.status}".`;
    case 'ALREADY_CANCELLED':
      return 'Esta reserva já foi cancelada.';
    case 'CANCEL_DEADLINE_PASSED':
      return `O cancelamento online é possível até ${hoursText(num(p.minutes))} antes do horário.`;
    case 'NO_SHOW_TOO_EARLY':
      return `A ausência só pode ser marcada depois da tolerância de ${p.minutes} min (a partir das ${formatTime(Date.parse(String(p.at)))}).`;
    case 'ARRIVAL_TOO_EARLY':
      return `A chegada pode ser registrada a partir de ${hoursText(num(p.minutes))} antes do horário reservado.`;
    case 'ARRIVAL_WINDOW_ENDED':
      return 'O período previsto desta reserva já terminou. Marque ausência ou registre uma nova reserva presencial.';
    case 'TABLE_BUSY_NOW':
      return area
        ? `A área ${area} não tem lugares livres agora para esse grupo. Aguarde a saída de clientes ou mude de área antes de registrar a chegada.`
        : `A mesa ${p.table} não está livre agora. Aguarde a liberação ou troque a mesa antes de registrar a chegada.`;
    case 'PREP_NOT_ACTIVE':
      return 'A mesa não está em preparação neste momento.';
    case 'EXTENSION_INVALID':
      return `Escolha uma extensão entre ${p.min} e ${p.max} minutos, em múltiplos de ${p.step}.`;
    case 'REASON_REQUIRED':
      return `Informe o motivo (pelo menos ${p.min} caracteres).`;
    case 'REASON_TOO_LONG':
      return `O motivo pode ter até ${p.max} caracteres.`;
    case 'BLOCK_NOT_FOUND':
      return 'Bloqueio não encontrado.';
    case 'BLOCK_RANGE_INVALID':
      return 'O fim do bloqueio precisa ser depois do início.';
    case 'BLOCK_IN_PAST':
      return 'O bloqueio não pode começar no passado.';
    case 'BLOCK_TOO_LONG':
      return `Um bloqueio pode durar até ${p.days} dias.`;
    case 'BLOCK_ALREADY_ENDED':
      return 'Este bloqueio já terminou e permanece no histórico.';
    case 'RULE_OUT_OF_RANGE':
      return p.options
        ? `Escolha um destes valores: ${p.options}.`
        : `Use um valor entre ${p.min} e ${p.max}${num(p.step) > 1 ? `, em múltiplos de ${p.step}` : ''}.`;
    case 'SHIFT_TIME_INVALID':
      return 'Informe horários válidos para o turno.';
    case 'SHIFT_ORDER_INVALID':
      return 'O fim do turno precisa ser depois do início.';
    case 'SHIFTS_OVERLAP':
      return 'O primeiro turno (Serviço) precisa terminar antes de o segundo turno começar.';
    case 'EXCEPTION_DATE_INVALID':
      return 'Informe uma data válida.';
    case 'EXCEPTION_DATE_PAST':
      return 'Exceções de datas passadas ficam no histórico e não podem ser alteradas.';
    case 'EXCEPTION_DUPLICATE':
      return 'Já existe uma exceção para essa data.';
    case 'EXCEPTION_NOTE_TOO_LONG':
      return `A observação pode ter até ${p.max} caracteres.`;
    case 'SCHEDULE_CONFLICTS':
      return 'Há reservas futuras que deixariam de caber no funcionamento. Cancele com justificativa ou altere essas reservas antes de salvar.';
    case 'CLOSURE_RANGE_INVALID':
      return 'A data final precisa ser igual ou posterior à data inicial.';
    case 'CLOSURE_TOO_LONG':
      return `Feche no máximo ${p.max} dias de uma vez.`;
    case 'CLOSURE_GUESTS_PRESENT':
      return 'Há clientes sendo atendidos agora. Conclua esses atendimentos antes de fechar o dia de hoje.';
    case 'CLOSURE_MESSAGE_TOO_LONG':
      return `A mensagem aos clientes pode ter até ${p.max} caracteres.`;
    case 'CAPACITY_INVALID':
      return `A capacidade deve ficar entre ${p.min} e ${p.max} lugares.`;
    case 'TABLE_CHANGE_CONFLICTS':
      return 'Há reservas futuras, clientes presentes ou preparações que ficariam inválidos. Troque a mesa dessas reservas antes de salvar.';
    case 'ONLINE_LIMIT_ABOVE_CAPACITY':
      return `O limite de pessoas online não pode passar da maior mesa ou área ativa (${p.max} lugares).`;
    case 'NO_ACTIVE_TABLES':
      return 'Mantenha pelo menos uma mesa ativa.';
    case 'PERSISTENCE_BLOCKED':
      return 'Não foi possível salvar as alterações.';
    default: {
      const exhaustive: never = error.code;
      return String(exhaustive);
    }
  }
}

export function warningMessage(warning: DomainWarning): string {
  const p = warning.params ?? {};
  const area = areaName(p);
  switch (warning.code) {
    case 'EARLY_ARRIVAL':
      return `Chegada muito antecipada: ${p.minutes} min antes do horário reservado. A mesa estava livre e passa a ficar ocupada a partir de agora.`;
    case 'LATE_ARRIVAL':
      return `Chegada ${p.minutes} min após o horário. As demais reservas não foram deslocadas.`;
    case 'PREP_OVERLAPS_NEXT':
      return area
        ? `Com a preparação, a área ${area} fica acima da capacidade quando as próximas reservas chegarem. Considere mudar a área de uma delas.`
        : `A preparação da mesa ${p.table} vai terminar depois do início da próxima reserva. Considere trocar a mesa da próxima reserva.`;
    case 'SHIFT_TOO_SHORT':
      return `Há turno mais curto que atendimento + preparação (${p.minutes} min): ele não terá horários disponíveis.`;
    case 'SAVED_IN_MEMORY_ONLY':
      return 'Alteração mantida apenas em memória.';
    default: {
      const exhaustive: never = warning.code;
      return String(exhaustive);
    }
  }
}

/** Descrição de um conflito para a administração (nunca exibida ao cliente). */
export function conflictMessage(conflict: ConflictInfo, data: DemoData): string {
  const period = `${formatDateTime(conflict.start)}–${formatTime(conflict.end)}`;
  if (conflict.kind === 'block') {
    const block = data.blocks.find((b) => b.id === conflict.id);
    return `${period} · Bloqueio${block ? `: ${block.reason}` : ''}`;
  }
  const reservation = data.reservations.find((r) => r.id === conflict.id);
  const who = reservation ? `${reservation.customer.name}, ${common.common.people(reservation.partySize)} (${reservation.code})` : '';
  return `${period} · ${common.segment[conflict.segment]} · ${who}`;
}
