import type { remote as ptRemote } from '../pt-BR/remote';

export const remote = {
  bootError: 'We couldn’t load bookings right now. Please check your connection and try again.',
  retry: 'Try again',
  sync: {
    saving: 'Saving…',
    saved: 'All saved',
    offline: 'No connection: the latest changes haven’t been saved yet. Please keep this page open; we’ll retry automatically.',
    rejectedTitle: 'Change not saved',
    updatedTitle: 'Data updated',
    updatedText: 'Someone else changed the bookings; the screen already shows the latest version.',
  },
  login: {
    documentTitle: 'Sign in',
    heading: 'Staff area',
    lead: 'Enter the team password to view and manage bookings.',
    password: 'Password',
    submit: 'Sign in',
    submitting: 'Signing in…',
    wrong: 'Incorrect password.',
    rateLimited: 'Too many attempts. Please wait 15 minutes and try again.',
    network: 'Couldn’t reach the server. Please try again.',
    expired: 'Your session has expired. Sign in again to continue.',
    logout: 'Sign out',
    backToSite: 'Back to site',
  },
} satisfies typeof ptRemote;
