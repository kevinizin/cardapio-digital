import type { remote as ptRemote } from '../pt-BR/remote';

const nb = ' ';

export const remote = {
  bootError: 'Impossible de charger les réservations pour le moment. Vérifiez votre connexion et réessayez.',
  retry: 'Réessayer',
  sync: {
    saving: 'Enregistrement…',
    saved: 'Tout est enregistré',
    offline: `Pas de connexion${nb}: les dernières modifications ne sont pas encore enregistrées. Ne fermez pas cette page${nb}; nous réessaierons automatiquement.`,
    rejectedTitle: 'Modification non enregistrée',
    updatedTitle: 'Données mises à jour',
    updatedText: `Quelqu’un d’autre a modifié les réservations${nb}; l’écran affiche déjà la version la plus récente.`,
  },
  login: {
    documentTitle: 'Connexion',
    heading: 'Espace administration',
    lead: 'Saisissez le mot de passe de l’équipe pour consulter et gérer les réservations.',
    password: 'Mot de passe',
    submit: 'Se connecter',
    submitting: 'Connexion…',
    wrong: 'Mot de passe incorrect.',
    rateLimited: 'Trop de tentatives. Patientez 15 minutes et réessayez.',
    network: 'Impossible de joindre le serveur. Réessayez.',
    expired: 'Votre session a expiré. Reconnectez-vous pour continuer.',
    logout: 'Se déconnecter',
    backToSite: 'Retour au site',
  },
} satisfies typeof ptRemote;
