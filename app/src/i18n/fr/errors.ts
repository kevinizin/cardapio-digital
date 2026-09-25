import type { DomainError, DomainWarning } from '../../domain/errors';
import { createFormatters } from '../format';
import { common } from './common';

const { formatDuration, formatTime } = createFormatters('fr');
const nb = ' ';
const num = (value: string | number | undefined) => Number(value ?? 0);
const hoursText = (minutes: number) => (minutes % 60 === 0 ? `${minutes / 60}${nb}h` : formatDuration(minutes));

/** Message lisible pour chaque code d’erreur des règles. */
export function errorMessage(error: DomainError): string {
  const p = error.params ?? {};
  switch (error.code) {
    case 'PARTY_SIZE_INVALID':
      return 'Indiquez le nombre de personnes.';
    case 'PARTY_ABOVE_ONLINE_LIMIT':
      return `La réservation en ligne est possible jusqu’à ${p.max} personnes.`;
    case 'PARTY_ABOVE_CAPACITY':
      return `Aucune table disponible ne peut accueillir ce groupe (jusqu’à ${p.max} personnes par table${nb}; les tables ne sont pas regroupées).`;
    case 'DATE_INVALID':
      return 'Indiquez une date valide.';
    case 'TIME_INVALID':
      return 'Indiquez une heure valide au format 24 heures.';
    case 'TIME_NONEXISTENT':
      return 'Cette heure n’existe pas à Paris à cette date, en raison du passage à l’heure d’été.';
    case 'DAY_PAST':
      return 'Cette date est déjà passée.';
    case 'DAY_CLOSED':
      return 'Le restaurant est fermé à cette date.';
    case 'BEYOND_WINDOW':
      return `Les réservations sont ouvertes sur les ${p.days} prochains jours.`;
    case 'START_IN_PAST':
      return 'Cet horaire est déjà passé.';
    case 'MIN_ADVANCE':
      return `La réservation en ligne doit être faite au moins ${p.minutes}${nb}minutes à l’avance.`;
    case 'OFF_GRID':
      return `Les horaires de début suivent des intervalles de ${p.minutes}${nb}minutes.`;
    case 'OUTSIDE_SHIFT':
      return 'Le service et la préparation de la table doivent tenir entièrement dans un service d’ouverture.';
    case 'SERVICE_DURATION_INVALID':
      return `La durée du service doit être comprise entre ${p.min} et ${p.max}${nb}minutes, par multiples de ${p.step}.`;
    case 'PREP_DURATION_INVALID':
      return `La préparation doit être comprise entre ${p.min} et ${p.max}${nb}minutes, par multiples de ${p.step}.`;
    case 'TABLE_NOT_FOUND':
      return 'Table introuvable.';
    case 'TABLE_INACTIVE':
      return `La table ${p.table} est désactivée.`;
    case 'TABLE_TOO_SMALL':
      return `La table ${p.table} accueille ${p.capacity} personnes et le groupe en compte ${p.partySize}.`;
    case 'CONFLICT':
      return `La table ${p.table} est déjà occupée sur une partie de cette période.`;
    case 'NO_TABLE_AVAILABLE':
      return 'Aucune table libre ne peut accueillir ce groupe à cet horaire.';
    case 'SLOT_UNAVAILABLE':
      return 'Cet horaire vient d’être réservé.';
    case 'NAME_REQUIRED':
      return 'Indiquez votre nom.';
    case 'NAME_TOO_SHORT':
      return `Le nom doit comporter au moins ${p.min} caractères.`;
    case 'NAME_TOO_LONG':
      return `Le nom peut comporter jusqu’à ${p.max} caractères.`;
    case 'EMAIL_REQUIRED':
      return 'Indiquez votre e-mail.';
    case 'EMAIL_INVALID':
      return 'Indiquez un e-mail valide, par exemple nom@exemple.fr.';
    case 'EMAIL_TOO_LONG':
      return `L’e-mail peut comporter jusqu’à ${p.max} caractères.`;
    case 'PHONE_INVALID':
      return `Utilisez de 6 à 15 chiffres${nb}; les espaces et les symboles + ( ) - . sont acceptés.`;
    case 'PHONE_TOO_LONG':
      return `Le téléphone peut comporter jusqu’à ${p.max} caractères.`;
    case 'NOTES_TOO_LONG':
      return `La remarque peut comporter jusqu’à ${p.max} caractères.`;
    case 'SOURCE_INVALID':
      return 'Choisissez une origine valide.';
    case 'NETWORK_ERROR':
      return 'Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.';
    case 'RATE_LIMITED':
      return 'Trop de tentatives en peu de temps. Patientez quelques minutes et réessayez.';
    case 'SAVE_REJECTED':
      return `La modification n’a pas pu être enregistrée car les données ont changé. L’écran a été mis à jour${nb}; vérifiez et recommencez si nécessaire.`;
    case 'NOT_FOUND':
      return 'Réservation introuvable.';
    case 'NOT_EDITABLE':
      return `Seules les réservations confirmées ou dont le client est arrivé peuvent être modifiées${nb}; une fois le client à table, la date, l’heure et les durées ne changent plus.`;
    case 'STATUS_NOT_ALLOWED':
      return `Action indisponible pour les réservations au statut «${nb}${common.reservationStatus[p.status as keyof typeof common.reservationStatus] ?? p.status}${nb}».`;
    case 'ALREADY_CANCELLED':
      return 'Cette réservation a déjà été annulée.';
    case 'CANCEL_DEADLINE_PASSED':
      return `L’annulation en ligne est possible jusqu’à ${hoursText(num(p.minutes))} avant l’heure réservée.`;
    case 'NO_SHOW_TOO_EARLY':
      return `L’absence ne peut être enregistrée qu’après la tolérance de ${p.minutes}${nb}min (à partir de ${formatTime(Date.parse(String(p.at)))}).`;
    case 'ARRIVAL_TOO_EARLY':
      return `L’arrivée peut être enregistrée à partir de ${hoursText(num(p.minutes))} avant l’heure réservée.`;
    case 'ARRIVAL_WINDOW_ENDED':
      return 'La période prévue pour cette réservation est terminée. Enregistrez une absence ou une nouvelle réservation sur place.';
    case 'TABLE_BUSY_NOW':
      return `La table ${p.table} n’est pas libre pour le moment. Attendez qu’elle se libère ou changez de table avant d’enregistrer l’arrivée.`;
    case 'PREP_NOT_ACTIVE':
      return 'La table n’est pas en préparation en ce moment.';
    case 'EXTENSION_INVALID':
      return `Choisissez une prolongation entre ${p.min} et ${p.max}${nb}minutes, par multiples de ${p.step}.`;
    case 'REASON_REQUIRED':
      return `Indiquez le motif (au moins ${p.min} caractères).`;
    case 'REASON_TOO_LONG':
      return `Le motif peut comporter jusqu’à ${p.max} caractères.`;
    case 'BLOCK_NOT_FOUND':
      return 'Blocage introuvable.';
    case 'BLOCK_RANGE_INVALID':
      return 'La fin du blocage doit être postérieure au début.';
    case 'BLOCK_IN_PAST':
      return 'Le blocage ne peut pas commencer dans le passé.';
    case 'BLOCK_TOO_LONG':
      return `Un blocage peut durer jusqu’à ${p.days} jours.`;
    case 'BLOCK_ALREADY_ENDED':
      return 'Ce blocage est terminé et reste dans l’historique.';
    case 'RULE_OUT_OF_RANGE':
      return p.options
        ? `Choisissez l’une de ces valeurs${nb}: ${p.options}.`
        : `Utilisez une valeur entre ${p.min} et ${p.max}${num(p.step) > 1 ? `, par multiples de ${p.step}` : ''}.`;
    case 'SHIFT_TIME_INVALID':
      return 'Indiquez des horaires valides pour le service.';
    case 'SHIFT_ORDER_INVALID':
      return 'La fin du service doit être postérieure au début.';
    case 'SHIFTS_OVERLAP':
      return 'Le déjeuner doit se terminer avant le début du dîner.';
    case 'EXCEPTION_DATE_INVALID':
      return 'Indiquez une date valide.';
    case 'EXCEPTION_DATE_PAST':
      return 'Les exceptions passées restent dans l’historique et ne peuvent plus être modifiées.';
    case 'EXCEPTION_DUPLICATE':
      return 'Une exception existe déjà pour cette date.';
    case 'EXCEPTION_NOTE_TOO_LONG':
      return `La remarque peut comporter jusqu’à ${p.max} caractères.`;
    case 'SCHEDULE_CONFLICTS':
      return 'Des réservations à venir ne tiendraient plus dans les horaires. Annulez-les avec un motif ou modifiez-les avant d’enregistrer.';
    case 'CAPACITY_INVALID':
      return `La capacité doit être comprise entre ${p.min} et ${p.max} couverts.`;
    case 'TABLE_CHANGE_CONFLICTS':
      return 'Des réservations à venir, des clients présents ou des préparations deviendraient invalides. Changez la table de ces réservations avant d’enregistrer.';
    case 'ONLINE_LIMIT_ABOVE_CAPACITY':
      return `La limite de personnes en ligne ne peut pas dépasser la plus grande table active (${p.max} couverts).`;
    case 'NO_ACTIVE_TABLES':
      return 'Gardez au moins une table active.';
    case 'PERSISTENCE_BLOCKED':
      return 'Impossible d’enregistrer les modifications.';
    default: {
      const exhaustive: never = error.code;
      return String(exhaustive);
    }
  }
}

export function warningMessage(warning: DomainWarning): string {
  const p = warning.params ?? {};
  switch (warning.code) {
    case 'EARLY_ARRIVAL':
      return `Arrivée très en avance${nb}: ${p.minutes}${nb}min avant l’heure réservée. La table était libre et est désormais occupée.`;
    case 'LATE_ARRIVAL':
      return `Arrivée ${p.minutes}${nb}min après l’heure. Les autres réservations n’ont pas été décalées.`;
    case 'PREP_OVERLAPS_NEXT':
      return `La préparation de la table ${p.table} se terminera après le début de la réservation suivante. Pensez à changer la table de la réservation suivante.`;
    case 'SHIFT_TOO_SHORT':
      return `Un service est plus court que service + préparation (${p.minutes}${nb}min)${nb}: il n’aura aucun horaire disponible.`;
    case 'SAVED_IN_MEMORY_ONLY':
      return 'Modification conservée uniquement en mémoire.';
    default: {
      const exhaustive: never = warning.code;
      return String(exhaustive);
    }
  }
}
