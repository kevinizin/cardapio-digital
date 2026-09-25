import type { DomainError, DomainWarning } from '../../domain/errors';
import { createFormatters } from '../format';
import { common } from './common';

const { formatDuration, formatTime } = createFormatters('en');
const num = (value: string | number | undefined) => Number(value ?? 0);
const hoursText = (minutes: number) =>
  minutes % 60 === 0 ? `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'}` : formatDuration(minutes);

/** Readable message for each business-rule error code. */
export function errorMessage(error: DomainError): string {
  const p = error.params ?? {};
  switch (error.code) {
    case 'PARTY_SIZE_INVALID':
      return 'Please enter the number of guests.';
    case 'PARTY_ABOVE_ONLINE_LIMIT':
      return `Online bookings are for groups of up to ${p.max}.`;
    case 'PARTY_ABOVE_CAPACITY':
      return `No active table can seat this group (up to ${p.max} per table; tables are not combined).`;
    case 'DATE_INVALID':
      return 'Please enter a valid date.';
    case 'TIME_INVALID':
      return 'Please enter a valid time in 24-hour format.';
    case 'TIME_NONEXISTENT':
      return 'This time doesn’t exist in Paris on this date because of the switch to summer time.';
    case 'DAY_PAST':
      return 'This date has already passed.';
    case 'DAY_CLOSED':
      return 'The restaurant is closed on this date.';
    case 'BEYOND_WINDOW':
      return `Bookings are open for the next ${p.days} days.`;
    case 'START_IN_PAST':
      return 'This time has already passed.';
    case 'MIN_ADVANCE':
      return `Online bookings must be made at least ${p.minutes} minutes in advance.`;
    case 'OFF_GRID':
      return `Start times are in ${p.minutes}-minute steps.`;
    case 'OUTSIDE_SHIFT':
      return 'Service and table preparation must fit entirely within an opening period.';
    case 'SERVICE_DURATION_INVALID':
      return `Service duration must be between ${p.min} and ${p.max} minutes, in steps of ${p.step}.`;
    case 'PREP_DURATION_INVALID':
      return `Preparation must be between ${p.min} and ${p.max} minutes, in steps of ${p.step}.`;
    case 'TABLE_NOT_FOUND':
      return 'Table not found.';
    case 'TABLE_INACTIVE':
      return `Table ${p.table} is inactive.`;
    case 'TABLE_TOO_SMALL':
      return `Table ${p.table} seats ${p.capacity} and the group has ${p.partySize}.`;
    case 'CONFLICT':
      return `Table ${p.table} is already taken for part of this period.`;
    case 'NO_TABLE_AVAILABLE':
      return 'No free table can seat this group at this time.';
    case 'SLOT_UNAVAILABLE':
      return 'This time has just been taken.';
    case 'NAME_REQUIRED':
      return 'Please enter your name.';
    case 'NAME_TOO_SHORT':
      return `The name must be at least ${p.min} characters long.`;
    case 'NAME_TOO_LONG':
      return `The name can be up to ${p.max} characters long.`;
    case 'EMAIL_REQUIRED':
      return 'Please enter your email.';
    case 'EMAIL_INVALID':
      return 'Please enter a valid email, such as name@example.com.';
    case 'EMAIL_TOO_LONG':
      return `The email can be up to ${p.max} characters long.`;
    case 'PHONE_INVALID':
      return 'Use 6 to 15 digits; spaces and the symbols + ( ) - . are allowed.';
    case 'PHONE_TOO_LONG':
      return `The phone number can be up to ${p.max} characters long.`;
    case 'NOTES_TOO_LONG':
      return `The note can be up to ${p.max} characters long.`;
    case 'SOURCE_INVALID':
      return 'Please choose a valid source.';
    case 'NETWORK_ERROR':
      return 'Couldn’t reach the server. Please check your connection and try again.';
    case 'RATE_LIMITED':
      return 'Too many attempts in a short time. Please wait a few minutes and try again.';
    case 'SAVE_REJECTED':
      return 'The change couldn’t be saved because the data has changed. The screen has been updated; check it and try again if needed.';
    case 'NOT_FOUND':
      return 'Booking not found.';
    case 'NOT_EDITABLE':
      return 'Only confirmed bookings or bookings with the guest present can be edited; once the guest is seated, date, time and durations can’t change.';
    case 'STATUS_NOT_ALLOWED':
      return `Action unavailable for bookings with status “${common.reservationStatus[p.status as keyof typeof common.reservationStatus] ?? p.status}”.`;
    case 'ALREADY_CANCELLED':
      return 'This booking has already been cancelled.';
    case 'CANCEL_DEADLINE_PASSED':
      return `Online cancellation is possible up to ${hoursText(num(p.minutes))} before your booking.`;
    case 'NO_SHOW_TOO_EARLY':
      return `A no-show can only be recorded after the ${p.minutes}-min grace period (from ${formatTime(Date.parse(String(p.at)))}).`;
    case 'ARRIVAL_TOO_EARLY':
      return `Arrival can be recorded from ${hoursText(num(p.minutes))} before the booking time.`;
    case 'ARRIVAL_WINDOW_ENDED':
      return 'The expected period for this booking has ended. Record a no-show or a new walk-in booking.';
    case 'TABLE_BUSY_NOW':
      return `Table ${p.table} isn’t free right now. Wait until it’s free or change the table before recording the arrival.`;
    case 'PREP_NOT_ACTIVE':
      return 'The table isn’t being prepared right now.';
    case 'EXTENSION_INVALID':
      return `Choose an extension between ${p.min} and ${p.max} minutes, in steps of ${p.step}.`;
    case 'REASON_REQUIRED':
      return `Please enter a reason (at least ${p.min} characters).`;
    case 'REASON_TOO_LONG':
      return `The reason can be up to ${p.max} characters long.`;
    case 'BLOCK_NOT_FOUND':
      return 'Block not found.';
    case 'BLOCK_RANGE_INVALID':
      return 'The block must end after it starts.';
    case 'BLOCK_IN_PAST':
      return 'A block can’t start in the past.';
    case 'BLOCK_TOO_LONG':
      return `A block can last up to ${p.days} days.`;
    case 'BLOCK_ALREADY_ENDED':
      return 'This block has already ended and stays in the history.';
    case 'RULE_OUT_OF_RANGE':
      return p.options
        ? `Choose one of these values: ${p.options}.`
        : `Use a value between ${p.min} and ${p.max}${num(p.step) > 1 ? `, in steps of ${p.step}` : ''}.`;
    case 'SHIFT_TIME_INVALID':
      return 'Please enter valid times for the opening period.';
    case 'SHIFT_ORDER_INVALID':
      return 'The opening period must end after it starts.';
    case 'SHIFTS_OVERLAP':
      return 'The first service must end before the second one starts.';
    case 'EXCEPTION_DATE_INVALID':
      return 'Please enter a valid date.';
    case 'EXCEPTION_DATE_PAST':
      return 'Past exceptions stay in the history and can’t be changed.';
    case 'EXCEPTION_DUPLICATE':
      return 'There is already an exception for this date.';
    case 'EXCEPTION_NOTE_TOO_LONG':
      return `The note can be up to ${p.max} characters long.`;
    case 'SCHEDULE_CONFLICTS':
      return 'Some upcoming bookings would no longer fit the opening hours. Cancel them with a reason or change them before saving.';
    case 'CAPACITY_INVALID':
      return `Capacity must be between ${p.min} and ${p.max} seats.`;
    case 'TABLE_CHANGE_CONFLICTS':
      return 'Some upcoming bookings, seated guests or preparations would become invalid. Change the table for those bookings before saving.';
    case 'ONLINE_LIMIT_ABOVE_CAPACITY':
      return `The online group limit can’t exceed the largest active table (${p.max} seats).`;
    case 'NO_ACTIVE_TABLES':
      return 'Keep at least one table active.';
    case 'PERSISTENCE_BLOCKED':
      return 'The changes couldn’t be saved.';
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
      return `Very early arrival: ${p.minutes} min before the booking time. The table was free and is now occupied.`;
    case 'LATE_ARRIVAL':
      return `Arrival ${p.minutes} min late. Other bookings have not been moved.`;
    case 'PREP_OVERLAPS_NEXT':
      return `Preparation of table ${p.table} will end after the next booking starts. Consider changing the table for the next booking.`;
    case 'SHIFT_TOO_SHORT':
      return `An opening period is shorter than service + preparation (${p.minutes} min): it will have no available times.`;
    case 'SAVED_IN_MEMORY_ONLY':
      return 'Change kept in memory only.';
    default: {
      const exhaustive: never = warning.code;
      return String(exhaustive);
    }
  }
}
