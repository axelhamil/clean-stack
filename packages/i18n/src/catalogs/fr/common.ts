export default {
  brand: "clean-stack",
  actions: {
    save: "Enregistrer",
    cancel: "Annuler",
    retry: "Réessayer",
    reload: "Recharger",
  },
  roles: {
    owner: "Propriétaire",
    admin: "Administrateur",
    member: "Membre",
  },
  errorBoundary: {
    title: "Une erreur est survenue",
    body: "Nous avons été alertés et nous examinons le problème. Essayez de recharger la page.",
  },
  nav: {
    dashboard: "Tableau de bord",
    settings: "Paramètres",
    admin: "Administration",
  },
  shell: {
    brandLabel: "App",
    search: "Rechercher...",
    openCommandPalette: "Ouvrir la palette de commandes",
    logoAlt: "Logo de l'application",
  },
  commandPalette: {
    searchPlaceholder: "Rechercher des pages, actions, organisations...",
    noResults: "Aucun résultat.",
    actionFailed: "L'action a échoué",
    groups: {
      navigate: "Naviguer",
      switchOrganization: "Changer d'organisation",
      admin: "Administration",
      legal: "Légal & confidentialité",
      actions: "Actions",
    },
    nav: {
      organization: "Paramètres — Organisation",
      billing: "Paramètres — Facturation",
      webhooks: "Paramètres — Webhooks",
      account: "Paramètres — Compte",
      privacy: "Paramètres — Confidentialité",
      eventCatalog: "Développeurs — Catalogue d'événements",
    },
    organizationActive: "actif",
    admin: {
      auditLog: "Administration — Journal d'audit",
      accounts: "Administration — Comptes",
      organizations: "Administration — Organisations",
    },
    theme: {
      light: "Thème : clair",
      dark: "Thème : sombre",
      system: "Thème : système",
      active: "actif",
    },
    copyOrgSlug: "Copier l'identifiant de l'organisation",
    orgSlugCopiedToast: "Identifiant de l'organisation copié dans le presse-papiers",
  },
  contextualTabs: {
    ariaLabel: "Sections des paramètres",
    organization: "Organisation",
    billing: "Facturation",
    webhooks: "Webhooks",
    sso: "Authentification unique",
    account: "Compte",
    notifications: "Notifications",
    privacy: "Confidentialité",
    apiTokens: "Jetons API",
  },
  orgSwitcher: {
    searchPlaceholder: "Rechercher une organisation...",
    noResults: "Aucune organisation trouvée.",
    heading: "Organisations",
    newOrganization: "Nouvelle organisation",
    selectPlaceholder: "Sélectionner une organisation",
    switchFailed: "Échec du changement d'organisation",
  },
  userMenu: {
    openMenu: "Ouvrir le menu utilisateur",
    account: "Compte",
    signOut: "Se déconnecter",
    signingOut: "Déconnexion…",
  },
  impersonation: {
    activeSession: "Session d'emprunt d'identité active — agit en tant que <name></name>",
    remainingMinutes: "{{minutes}} min restantes",
    expired: "session expirée",
    end: "Arrêter l'emprunt d'identité",
  },
  cookieBanner: {
    ariaLabel: "Consentement aux cookies",
    message:
      "Nous utilisons des cookies pour faire fonctionner ce service. Les cookies optionnels aident à améliorer votre expérience.",
    policyLink: "Politique cookies",
    rejectAll: "Tout refuser",
    customize: "Personnaliser",
    acceptAll: "Tout accepter",
    preferencesTitle: "Préférences cookies",
  },
  cookieConsent: {
    title: "Gérez vos préférences cookies",
    save: "Enregistrer les préférences",
    withdraw: "Retirer tous les consentements",
    savedToast: "Préférences enregistrées",
    withdrawnToast: "Consentement retiré",
    categories: {
      necessary: {
        label: "Strictement nécessaires",
        description:
          "Indispensables au fonctionnement du service. Ils ne peuvent pas être désactivés.",
      },
      functional: {
        label: "Fonctionnels",
        description:
          "Améliorent votre expérience (préférences de langue ou de région, par exemple).",
      },
      analytics: {
        label: "Mesure d'audience",
        description:
          "Nous aident à comprendre comment le service est utilisé (données anonymisées).",
      },
      marketing: {
        label: "Marketing et publicité",
        description: "Autorisent la publicité personnalisée et le reciblage.",
      },
    },
  },
  legal: {
    policies: {
      privacyTitle: "Politique de confidentialité",
      termsTitle: "Conditions d'utilisation",
      versionLine: "Version {{version}} — en vigueur depuis le {{date}}",
      unavailableBanner:
        "Ce document n'est pas encore disponible dans votre langue. Vous consultez la version anglaise ci-dessous.",
    },
    accessibility: {
      title: "Déclaration d'accessibilité",
      subtitle: "EAA Art. 14 · EN 301 549 v3.2.1 / WCAG 2.1 AA — Dernière relecture : 2026-07-09",
    },
    cookies: {
      title: "Politique de cookies",
      subtitle: "Conforme CNIL — Dernière mise à jour : 2026-07-09",
      tableCaption: "Cookies de la catégorie {{category}} utilisés par cette application",
    },
    dataRights: {
      title: "Vos droits sur vos données",
      subtitle:
        "Information de transparence RGPD Art. 13/14. Dernière mise à jour à la date de déploiement de cette page.",
    },
    subProcessors: {
      title: "Registre des sous-traitants",
      subtitle: "RGPD Art. 28 — Dernière mise à jour : 2026-07-09",
      table: {
        name: "Nom",
        purpose: "Finalité",
        region: "Région / base de transfert",
        dpa: "DPA",
      },
      resend: {
        purpose: "Envoi d'e-mails transactionnels",
        region: "États-Unis (certifié EU DPF)",
      },
      r2: {
        purpose: "Stockage d'objets (fichiers téléversés)",
        region: "UE ou États-Unis (zone configurable)",
      },
      betterAuth: {
        purpose: "Authentification sociale OAuth",
        region: "États-Unis / UE (selon le fournisseur)",
      },
      stripe: {
        purpose: "Traitement des paiements et facturation",
        region: "États-Unis (certifié EU DPF)",
      },
      umami: {
        purpose: "Mesure d'audience respectueuse de la vie privée",
        region: "Configurable (auto-hébergeable)",
      },
    },
    accept: {
      title: "Avant de commencer",
      titleReacceptance: "Politiques mises à jour",
      subtitle:
        "Merci de consulter et d'accepter notre politique de confidentialité et nos conditions d'utilisation pour continuer.",
      subtitleReacceptance:
        "Nous avons mis à jour nos politiques. Merci de consulter les changements et de les accepter pour continuer.",
      updatedBadge: "Mise à jour",
      readFull: "Lire {{title}} en intégralité",
      acceptButton: "Accepter et continuer",
      acceptingButton: "Acceptation…",
    },
    routes: {
      dataRights: "Droits sur les données (RGPD)",
      privacyPolicy: "Politique de confidentialité",
      terms: "Conditions d'utilisation",
      subProcessors: "Sous-traitants (RGPD Art. 28)",
      accessibility: "Déclaration d'accessibilité (EAA Art. 14)",
      cookies: "Politique de cookies (CNIL)",
    },
  },
  legalFooter: {
    ariaLabel: "Légal",
  },
  clipboard: {
    copied: "{{label}} copié dans le presse-papiers",
    copyLabel: "Copier {{label}}",
  },
  secretReveal: {
    title: "Secret de signature",
    description:
      "Copiez-le maintenant — il ne s'affiche qu'une seule fois et ne pourra plus être récupéré.",
    secretLabel: "Secret",
    confirm: "Je l'ai enregistré",
  },
  theme: {
    switchToLight: "Passer au thème clair",
    switchToDark: "Passer au thème sombre",
  },
  notifications: {
    title: "Notifications",
    markAllRead: "Tout marquer comme lu",
    empty: "Vous êtes à jour.",
    unreadNone: "Notifications, aucune non lue",
    unreadLabel_one: "Notifications, {{count}} non lue",
    unreadLabel_other: "Notifications, {{count}} non lues",
    andMore: "et {{count}} de plus",
    newBadge: "Nouveau",
    categories: {
      security: "Sécurité",
      org: "Organisation",
      billing: "Facturation",
      activity: "Activité",
      unknown: "Autre",
    },
  },
  dashboard: {
    welcome: "Bon retour, {{name}}",
    subtitle: "Voici ce qui se passe aujourd'hui.",
    gettingStartedTitle: "Prise en main",
    gettingStartedDescription: "Configurez votre espace de travail.",
    gettingStartedBody:
      "Invitez vos collègues, configurez la facturation et commencez à livrer. Tout se trouve dans les Paramètres.",
    activityTitle: "Activité",
    activityDescription: "Événements récents dans votre espace de travail.",
    activityEmpty: "Rien pour l'instant — votre activité apparaîtra ici.",
    usageTitle: "Utilisation",
    usageDescription: "Quota et limites pour la période en cours.",
    usageEmpty: "Branchez la mesure d'usage dès qu'une ressource facturable existe.",
  },
  orgNew: {
    title: "Créer une organisation",
    subtitle: "Démarrez un nouvel espace de travail pour votre équipe.",
    detailsTitle: "Détails de l'organisation",
    detailsDescription: "Donnez un nom et un identifiant unique à votre organisation.",
    nameLabel: "Nom",
    namePlaceholder: "Acme",
    createdToast: "Organisation créée",
    createFailed: "Échec de la création de l'organisation",
  },
  invitation: {
    signInTitle: "Connectez-vous pour accepter",
    signInBody: "Vous devez être connecté pour accepter cette invitation.",
    joinTitle: "Rejoindre l'organisation",
    signedInAs:
      "Connecté en tant que {{email}}. Si ce n'est pas le bon compte, déconnectez-vous et reconnectez-vous avec l'adresse e-mail invitée.",
    acceptInvitation: "Accepter l'invitation",
    acceptedToast: "Invitation acceptée",
    acceptFailed: "Échec de l'acceptation de l'invitation",
  },
  states: {
    endpoint: {
      active: "Actif",
      paused: "En pause",
      autoDisabled: "Désactivé automatiquement",
    },
    delivery: {
      pending: "En attente",
      success: "Réussi",
      failed: "Échoué",
      deadLetter: "Lettre morte",
    },
  },
  pricing: {
    title: "Tarifs",
    subtitle: "Choisissez le forfait adapté à votre équipe.",
    free: "Gratuit",
    perInterval: "{{amount}}/{{interval}}",
    interval: {
      day: "jour",
      week: "semaine",
      month: "mois",
      year: "an",
    },
    currentPlanCta: "Forfait actuel",
    getStarted: "Commencer",
    upgrade: "Mettre à niveau",
  },
} as const;
