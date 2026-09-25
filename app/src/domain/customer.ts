import { LIMITS } from './defaults';
import { err, type DomainError } from './errors';
import type { Customer } from './types';

const EMAIL_RE = /^[^\s@]+@([^\s@.]+\.)+[^\s@.]{2,}$/;
const PHONE_RE = /^\+?[0-9\s().-]+$/;

export function normalizeCustomer(input: Customer): Customer {
  return {
    name: input.name.trim().replace(/\s+/g, ' '),
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim().replace(/\s+/g, ' '),
    notes: input.notes.trim(),
  };
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** Valida dados de contato. Não coleta dados sensíveis: apenas nome, e-mail, telefone e observação. */
export function validateCustomer(input: Customer, options: { emailRequired: boolean; phoneRequired?: boolean }): DomainError[] {
  const customer = normalizeCustomer(input);
  const errors: DomainError[] = [];

  if (!customer.name) errors.push(err('NAME_REQUIRED', { field: 'name' }));
  else if (customer.name.length < LIMITS.nameLength.min)
    errors.push(err('NAME_TOO_SHORT', { field: 'name', params: { min: LIMITS.nameLength.min } }));
  else if (customer.name.length > LIMITS.nameLength.max)
    errors.push(err('NAME_TOO_LONG', { field: 'name', params: { max: LIMITS.nameLength.max } }));

  if (!customer.email) {
    if (options.emailRequired) errors.push(err('EMAIL_REQUIRED', { field: 'email' }));
  } else if (customer.email.length > LIMITS.emailMaxLength) {
    errors.push(err('EMAIL_TOO_LONG', { field: 'email', params: { max: LIMITS.emailMaxLength } }));
  } else if (!EMAIL_RE.test(customer.email)) {
    errors.push(err('EMAIL_INVALID', { field: 'email' }));
  }

  if (!customer.phone) {
    if (options.phoneRequired) errors.push(err('PHONE_REQUIRED', { field: 'phone' }));
  } else {
    const digits = customer.phone.replace(/\D/g, '').length;
    if (customer.phone.length > LIMITS.phoneMaxLength)
      errors.push(err('PHONE_TOO_LONG', { field: 'phone', params: { max: LIMITS.phoneMaxLength } }));
    else if (!PHONE_RE.test(customer.phone) || digits < 6 || digits > 15)
      errors.push(err('PHONE_INVALID', { field: 'phone' }));
  }

  if (customer.notes.length > LIMITS.notesMaxLength)
    errors.push(err('NOTES_TOO_LONG', { field: 'notes', params: { max: LIMITS.notesMaxLength } }));

  return errors;
}
