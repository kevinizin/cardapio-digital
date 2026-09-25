import { describe, expect, it } from 'vitest';
import {
  CLOSURE_MAX_DAYS,
  closeDateRange,
  closedDayInfo,
  getClosureNotice,
  getClosureNotices,
  groupClosures,
  nextOpening,
  publicClosureRanges,
  reopenClosure,
  upcomingSpecials,
  type CloseRangeInput,
} from '../closures';
import { toPublicData } from '../../data/publicView';
import { validateDemoData } from '../../data/schema';
import { easterSunday, frenchHolidays, holidaysBetween, portugueseHolidayName } from '../holidays';
import { createSeededRandom } from '../ids';
import { restaurantSettings, restaurantTables } from '../restaurantSetup';
import { getDayStatus } from '../schedule';
import type { DateException, DemoData } from '../types';
import { at, baseData, iso, makeReservation } from './fixtures';

/** Sexta-feira, 25/09/2026, 10h em Paris. */
const NOW = at('2026-09-25', '10:00');
const random = createSeededRandom(7);
const codes = (result: { ok: boolean; errors?: { code: string }[] }) => (result.ok ? [] : result.errors!.map((e) => e.code));

/** Aromas da Vivi: terça a domingo 12h–22h, segunda fechado; Natal e Ano-novo já fechados. */
function vivi(overrides: Partial<DemoData> = {}): DemoData {
  return baseData({ settings: restaurantSettings('2020-01-01'), tables: restaurantTables(), ...overrides });
}

function close(data: DemoData, input: Partial<CloseRangeInput> & { from: string; to: string }, nowMs = NOW) {
  return closeDateRange(data, { note: 'Férias', ...input }, nowMs, random);
}

function closed(data: DemoData, input: Partial<CloseRangeInput> & { from: string; to: string }, nowMs = NOW): DemoData {
  const result = close(data, input, nowMs);
  if (!result.ok) throw new Error(`falha: ${codes(result).join(', ')}`);
  return result.value.data;
}

describe('closeDateRange: fechar vários dias de uma vez', () => {
  it('cria uma exceção fechada por dia, inclusive a segunda já fechada pela grade', () => {
    const result = close(vivi(), { from: '2026-10-10', to: '2026-10-13', publicMessage: { fr: '  Congés annuels ', en: '', pt: 'Férias' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.dates).toEqual(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']);
    const created = result.value.data.settings.exceptions.filter((e) => e.date >= '2026-10-10' && e.date <= '2026-10-13');
    expect(created).toHaveLength(4);
    for (const e of created) {
      expect(e).toMatchObject({ closed: true, note: 'Férias', publicMessage: { fr: 'Congés annuels', pt: 'Férias' } });
      expect(e.publicMessage).not.toHaveProperty('en');
    }
    for (const date of result.value.dates) expect(getDayStatus(result.value.data.settings, date, NOW)).toBe('closed');
    // Natal e Ano-novo continuam lá.
    expect(result.value.data.settings.exceptions.map((e) => e.date)).toContain('2026-12-25');
  });

  it('um único dia: início = fim', () => {
    const result = close(vivi(), { from: '2026-10-07', to: '2026-10-07', note: 'Evento privado' });
    expect(result.ok && result.value.dates).toEqual(['2026-10-07']);
  });

  it('substitui exceções existentes nas datas (horário especial ou outro fechamento), sem duplicar', () => {
    const special: DateException = {
      id: 'exc_special',
      date: '2026-10-08',
      closed: false,
      lunch: { enabled: true, start: '18:00', end: '23:00' },
      dinner: { enabled: false, start: '19:00', end: '22:00' },
      note: 'Noite especial',
    };
    const data = vivi();
    data.settings = { ...data.settings, exceptions: [...data.settings.exceptions, special] };
    const result = close(data, { from: '2026-10-07', to: '2026-10-09' });
    if (!result.ok) throw new Error('falha');
    const exceptions = result.value.data.settings.exceptions;
    expect(exceptions.filter((e) => e.date === '2026-10-08')).toHaveLength(1);
    expect(exceptions.find((e) => e.date === '2026-10-08')).toMatchObject({ closed: true, note: 'Férias' });
    expect(exceptions.some((e) => e.id === 'exc_special')).toBe(false);
    expect(exceptions.map((e) => e.date)).toEqual([...exceptions.map((e) => e.date)].sort());
    // Fechar de novo por cima do mesmo período também não duplica.
    const again = close(result.value.data, { from: '2026-10-07', to: '2026-10-08', note: 'Obra' });
    if (!again.ok) throw new Error('falha');
    expect(again.value.data.settings.exceptions.filter((e) => e.date === '2026-10-07')).toMatchObject([{ note: 'Obra' }]);
  });

  it(`valida datas, ordem, tamanho máximo (${CLOSURE_MAX_DAYS} dias) e textos`, () => {
    expect(codes(close(vivi(), { from: '2026-10-10', to: '2026-10-09' }))).toEqual(['CLOSURE_RANGE_INVALID']);
    expect(codes(close(vivi(), { from: '2026-09-20', to: '2026-09-30' }))).toEqual(['EXCEPTION_DATE_PAST']);
    expect(codes(close(vivi(), { from: '2026-02-30', to: '' }))).toEqual(['EXCEPTION_DATE_INVALID', 'EXCEPTION_DATE_INVALID']);
    expect(codes(close(vivi(), { from: '2026-10-01', to: '2026-11-29' }))).toEqual([]); // 60 dias
    expect(codes(close(vivi(), { from: '2026-10-01', to: '2026-11-30' }))).toEqual(['CLOSURE_TOO_LONG']);
    expect(codes(close(vivi(), { from: '2026-10-01', to: '2026-10-01', note: 'x'.repeat(121) }))).toEqual(['EXCEPTION_NOTE_TOO_LONG']);
    expect(codes(close(vivi(), { from: '2026-10-01', to: '2026-10-01', publicMessage: { en: 'x'.repeat(201) } }))).toEqual([
      'CLOSURE_MESSAGE_TOO_LONG',
    ]);
    // Hoje pode ser fechado.
    expect(codes(close(vivi(), { from: '2026-09-25', to: '2026-09-25' }))).toEqual([]);
  });

  it('reservas confirmadas nos dias fechados impedem o fechamento e voltam com os ids', () => {
    const inside = makeReservation({ tableId: 'SALAO', startAt: iso('2026-10-08', '20:00') });
    const outside = makeReservation({ tableId: 'SALAO', startAt: iso('2026-10-14', '20:00') });
    const data = vivi({ reservations: [inside, outside] });
    const result = close(data, { from: '2026-10-06', to: '2026-10-11' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatchObject({ code: 'SCHEDULE_CONFLICTS', reservationIds: [inside.id] });
    expect(data.settings.exceptions.some((e) => e.date === '2026-10-08')).toBe(false);
  });

  it('cancelar as reservas afetadas e fechar numa só operação (motivo = observação)', () => {
    const a = makeReservation({ tableId: 'SALAO', startAt: iso('2026-10-08', '20:00') });
    const b = makeReservation({ tableId: 'TERRACO', startAt: iso('2026-10-09', '13:00') });
    const outside = makeReservation({ tableId: 'SALAO', startAt: iso('2026-10-14', '20:00') });
    const data = vivi({ reservations: [a, b, outside] });

    // Só parte das reservas autorizadas: nada muda e as restantes são informadas.
    const partial = close(data, { from: '2026-10-06', to: '2026-10-11', cancelReservationIds: [a.id] });
    expect(partial.ok).toBe(false);
    if (!partial.ok) expect(partial.errors[0]).toMatchObject({ code: 'SCHEDULE_CONFLICTS', reservationIds: [b.id] });

    const result = close(data, { from: '2026-10-06', to: '2026-10-11', note: 'Férias de outono', cancelReservationIds: [a.id, b.id, outside.id] });
    if (!result.ok) throw new Error(codes(result).join());
    expect(result.value.cancelledIds).toEqual([a.id, b.id]);
    const byId = (id: string) => result.value.data.reservations.find((r) => r.id === id)!;
    expect(byId(a.id)).toMatchObject({ status: 'cancelled', cancelledBy: 'admin', cancelReason: 'Férias de outono' });
    expect(byId(b.id).history.at(-1)).toMatchObject({ kind: 'cancelled', actor: 'admin', reason: 'Férias de outono' });
    expect(byId(outside.id).status).toBe('confirmed');
    expect(result.value.data.settings.exceptions.filter((e) => e.date >= '2026-10-06' && e.date <= '2026-10-11')).toHaveLength(6);
  });

  it('observação curta demais para justificativa: usa um motivo padrão ao cancelar', () => {
    const r = makeReservation({ tableId: 'SALAO', startAt: iso('2026-10-08', '20:00') });
    const result = close(vivi({ reservations: [r] }), { from: '2026-10-08', to: '2026-10-08', note: '', cancelReservationIds: [r.id] });
    if (!result.ok) throw new Error('falha');
    expect(result.value.data.reservations[0].cancelReason).toBe('Restaurante fechado nesta data');
  });

  it('hoje com clientes à mesa não pode ser fechado; a partir de amanhã, sim', () => {
    const lunchNow = at('2026-09-25', '13:00');
    const seated = makeReservation({ tableId: 'SALAO', startAt: iso('2026-09-25', '12:30'), status: 'seated', seatedAt: iso('2026-09-25', '12:31') });
    const later = makeReservation({ tableId: 'TERRACO', startAt: iso('2026-09-25', '19:00') });
    const data = vivi({ reservations: [seated, later] });
    const refused = close(data, { from: '2026-09-25', to: '2026-09-27', cancelReservationIds: [later.id] }, lunchNow);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.errors[0]).toMatchObject({ code: 'CLOSURE_GUESTS_PRESENT', reservationIds: [seated.id] });
    expect(close(data, { from: '2026-09-26', to: '2026-09-27' }, lunchNow).ok).toBe(true);
  });

  it('fechar hoje cancela as reservas que ainda viriam hoje', () => {
    const lunchNow = at('2026-09-25', '13:00');
    const later = makeReservation({ tableId: 'SALAO', startAt: iso('2026-09-25', '19:00') });
    const result = close(vivi({ reservations: [later] }), { from: '2026-09-25', to: '2026-09-25', cancelReservationIds: [later.id] }, lunchNow);
    if (!result.ok) throw new Error('falha');
    expect(result.value.data.reservations[0].status).toBe('cancelled');
  });

  it('reabrir remove as exceções do período (as passadas ficam no histórico)', () => {
    const data = closed(vivi(), { from: '2026-10-06', to: '2026-10-11' });
    const [range] = groupClosures(data.settings, '2026-09-25');
    const reopened = reopenClosure(data, range.exceptionIds, NOW);
    if (!reopened.ok) throw new Error('falha');
    expect(reopened.value.dates).toHaveLength(6);
    expect(getDayStatus(reopened.value.data.settings, '2026-10-08', NOW)).toBe('open');
    expect(codes(reopenClosure(data, ['nao-existe'], NOW))).toEqual(['NOT_FOUND']);
  });
});

describe('agrupamento dos fechamentos em períodos', () => {
  it('administração: une datas consecutivas com a mesma observação, atravessando a segunda fechada', () => {
    let data = closed(vivi(), { from: '2026-10-06', to: '2026-10-11' }); // terça a domingo
    data = closed(data, { from: '2026-10-13', to: '2026-10-18' }); // terça a domingo seguinte
    data = closed(data, { from: '2026-10-21', to: '2026-10-21', note: 'Evento privado' });
    const ranges = groupClosures(data.settings, '2026-09-25');
    expect(ranges.map((r) => [r.from, r.to, r.note, r.exceptionIds.length])).toEqual([
      ['2026-10-06', '2026-10-18', 'Férias', 12],
      ['2026-10-21', '2026-10-21', 'Evento privado', 1],
      ['2026-12-25', '2026-12-25', 'Natal', 1],
      ['2027-01-01', '2027-01-01', 'Ano-novo', 1],
    ]);
    // Somente a partir da data pedida (fechamentos passados ficam de fora).
    expect(groupClosures(data.settings, '2026-10-19')[0].from).toBe('2026-10-21');
  });

  it('cliente: sáb + dom + segunda (grade) + terça = um só período de sábado a terça', () => {
    const data = vivi();
    const sat = closed(data, { from: '2026-10-10', to: '2026-10-11', note: 'A' });
    const withTuesday = closed(sat, { from: '2026-10-13', to: '2026-10-13', note: 'B', publicMessage: { fr: 'Travaux' } });
    const ranges = publicClosureRanges(withTuesday.settings, '2026-09-25', '2026-11-30');
    expect(ranges[0]).toEqual({ from: '2026-10-10', to: '2026-10-13', publicMessage: { fr: 'Travaux' } });
  });

  it('cliente: terça a domingo incorpora a segunda seguinte (reabre na terça)', () => {
    const data = closed(vivi(), { from: '2026-10-06', to: '2026-10-11' });
    expect(publicClosureRanges(data.settings, '2026-09-25', '2026-11-30')[0]).toMatchObject({ from: '2026-10-06', to: '2026-10-12' });
    // Nunca começa antes da data pedida.
    expect(publicClosureRanges(data.settings, '2026-10-07', '2026-11-30')[0]).toMatchObject({ from: '2026-10-07', to: '2026-10-12' });
  });

  it('cartão de horários: períodos fechados e horários especiais, sem a observação interna', () => {
    const data = closed(vivi(), { from: '2026-10-06', to: '2026-10-11', publicMessage: { en: 'Annual holidays' } });
    const items = upcomingSpecials(data.settings, '2026-09-25', '2026-11-24', 'en');
    expect(items).toEqual([{ kind: 'closed', from: '2026-10-06', to: '2026-10-12', message: 'Annual holidays' }]);
    expect(upcomingSpecials(data.settings, '2026-09-25', '2026-11-24', 'fr')[0]).toMatchObject({ message: null });
  });
});

describe('próxima abertura', () => {
  it('atravessa a mudança para o horário de inverno (25/10/2026)', () => {
    const data = closed(vivi(), { from: '2026-10-20', to: '2026-10-25' });
    const reopen = nextOpening(data.settings, at('2026-10-20', '09:00'));
    expect(reopen?.date).toBe('2026-10-27');
    expect(reopen?.start).toBe('12:00');
    expect(new Date(reopen!.startMs).toISOString()).toBe('2026-10-27T11:00:00.000Z'); // UTC+1
    const notice = getClosureNotice(data.settings, at('2026-10-20', '09:00'), 'fr');
    expect(notice).toMatchObject({ kind: 'closed_today', until: '2026-10-26' });
  });

  it('atravessa o Natal e a virada do ano', () => {
    // Natal (25/12) já estava fechado: o novo período se funde a ele.
    let data = closed(vivi(), { from: '2026-12-24', to: '2026-12-27', note: 'Festas' });
    expect(data.settings.exceptions.filter((e) => e.date === '2026-12-25')).toMatchObject([{ note: 'Festas' }]);
    const upcoming = getClosureNotice(data.settings, at('2026-12-20', '10:00'), 'pt');
    expect(upcoming).toMatchObject({ kind: 'upcoming', from: '2026-12-24', to: '2026-12-28' });
    expect(upcoming?.reopen).toMatchObject({ date: '2026-12-29', start: '12:00' });

    data = closed(data, { from: '2026-12-29', to: '2026-12-31', note: 'Festas' });
    const today = getClosureNotice(data.settings, at('2026-12-30', '15:00'), 'pt');
    expect(today).toMatchObject({ kind: 'closed_today', until: '2027-01-01' });
    expect(today?.reopen).toMatchObject({ date: '2027-01-02', start: '12:00' });
    expect(new Date(today!.reopen!.startMs).toISOString()).toBe('2027-01-02T11:00:00.000Z');
  });
});

describe('aviso do site (getClosureNotice)', () => {
  it('segunda-feira (grade semanal): fechado hoje, volta na terça às 12:00', () => {
    const notice = getClosureNotice(vivi().settings, at('2026-09-28', '10:00'), 'fr');
    expect(notice).toMatchObject({ kind: 'closed_today', until: '2026-09-28', message: null });
    expect(notice?.reopen).toMatchObject({ date: '2026-09-29', start: '12:00' });
  });

  it('dia aberto depois do expediente não aparece como "fechado hoje"', () => {
    expect(getClosureNotice(vivi().settings, at('2026-09-29', '23:00'), 'fr')).toBeNull();
    expect(getClosureNotice(vivi().settings, at('2026-09-29', '08:00'), 'fr')).toBeNull();
  });

  it('fechamento que começa nos próximos 14 dias aparece; mais longe, não', () => {
    const data = closed(vivi(), { from: '2026-10-06', to: '2026-10-11', publicMessage: { fr: 'Congés', pt: 'Férias da equipe' } });
    const fr = getClosureNotice(data.settings, NOW, 'fr');
    expect(fr).toMatchObject({ kind: 'upcoming', from: '2026-10-06', to: '2026-10-12', message: 'Congés' });
    expect(fr?.reopen).toMatchObject({ date: '2026-10-13', start: '12:00' });
    expect(getClosureNotice(data.settings, NOW, 'pt')?.message).toBe('Férias da equipe');
    // Sem mensagem em inglês: nada (nunca a observação interna "Férias").
    expect(getClosureNotice(data.settings, NOW, 'en')?.message).toBeNull();
    // 10 dias antes do limite ainda não aparece.
    expect(getClosureNotice(data.settings, at('2026-09-15', '10:00'), 'fr')).toBeNull();
    expect(getClosureNotice(data.settings, at('2026-09-15', '10:00'), 'fr', 30)).toMatchObject({ kind: 'upcoming' });
  });

  it('dentro do período fechado: fechado hoje com a mensagem e a reabertura', () => {
    const data = closed(vivi(), { from: '2026-10-06', to: '2026-10-11', publicMessage: { en: 'Holidays' } });
    const notice = getClosureNotice(data.settings, at('2026-10-07', '12:30'), 'en');
    expect(notice).toMatchObject({ kind: 'closed_today', until: '2026-10-12', message: 'Holidays' });
    expect(notice?.reopen?.date).toBe('2026-10-13');
  });

  it('segunda-feira com férias mais adiante: dois avisos', () => {
    const data = closed(vivi(), { from: '2026-10-06', to: '2026-10-11' });
    const notices = getClosureNotices(data.settings, at('2026-09-28', '10:00'), 'fr');
    expect(notices.map((n) => n.kind)).toEqual(['closed_today', 'upcoming']);
  });

  it('segunda-feira emendada com férias que começam na terça: um só período', () => {
    const data = closed(vivi(), { from: '2026-09-29', to: '2026-10-04' });
    const notices = getClosureNotices(data.settings, at('2026-09-28', '10:00'), 'fr');
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: 'closed_today', until: '2026-10-05' });
    expect(notices[0].reopen?.date).toBe('2026-10-06');
  });

  it('calendário de reservas: dia fechado informa reabertura e mensagem', () => {
    const data = closed(vivi(), { from: '2026-10-06', to: '2026-10-11', publicMessage: { pt: 'Férias' } });
    expect(closedDayInfo(data.settings, '2026-10-08', 'pt')).toMatchObject({ byException: true, message: 'Férias', until: '2026-10-12' });
    expect(closedDayInfo(data.settings, '2026-10-08', 'pt').reopen?.date).toBe('2026-10-13');
    const monday = closedDayInfo(data.settings, '2026-10-19', 'pt');
    expect(monday).toMatchObject({ byException: false, message: null });
    expect(monday.reopen?.date).toBe('2026-10-20');
  });
});

describe('feriados da França', () => {
  it('Páscoa e feriados móveis', () => {
    expect(easterSunday(2024)).toBe('2024-03-31');
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    const list = frenchHolidays(2026);
    expect(list).toHaveLength(11);
    expect(list.find((h) => h.localName === 'Ascension')?.date).toBe('2026-05-14');
    expect(list.find((h) => h.localName === 'Lundi de Pentecôte')?.date).toBe('2026-05-25');
    expect(list.find((h) => h.localName === 'Lundi de Pâques')?.date).toBe('2026-04-06');
  });

  it('nome em português pela data ou pelo nome francês', () => {
    expect(portugueseHolidayName({ date: '2026-07-14', localName: 'Fête nationale', name: 'Bastille Day' })).toBe('Festa Nacional (14 de julho)');
    expect(portugueseHolidayName({ date: '2026-11-01', localName: 'Toussaint', name: "All Saints' Day" })).toBe('Todos os Santos (1º de novembro)');
    expect(portugueseHolidayName({ date: '2026-04-03', localName: 'Vendredi saint', name: 'Good Friday' })).toBe('Vendredi saint');
    const next90 = holidaysBetween([...frenchHolidays(2026), ...frenchHolidays(2027)], '2026-09-25', '2026-12-24');
    expect(next90.map((h) => h.date)).toEqual(['2026-11-01', '2026-11-11']);
  });
});

describe('dados: mensagem aos clientes e observação interna', () => {
  it('o esquema preserva publicMessage e a visão pública esconde a observação interna', () => {
    const data = closed(vivi(), { from: '2026-10-06', to: '2026-10-07', note: 'Férias da Vivi', publicMessage: { fr: 'Congés' } });
    const validated = validateDemoData(JSON.parse(JSON.stringify(data)));
    expect(validated.ok).toBe(true);
    if (validated.ok) expect(validated.data.settings.exceptions.find((e) => e.date === '2026-10-06')?.publicMessage).toEqual({ fr: 'Congés' });
    const publicData = toPublicData(data, NOW);
    expect(JSON.stringify(publicData)).not.toContain('Férias da Vivi');
    expect(publicData.settings.exceptions.find((e) => e.date === '2026-10-06')).toMatchObject({ closed: true, note: '', publicMessage: { fr: 'Congés' } });
  });
});
