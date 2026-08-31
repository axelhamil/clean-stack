export default {
  users: {
    pageTitle: "Comptes",
    searchPlaceholder: "Rechercher…",
    loading: "Chargement…",
    loadFailed: "Échec du chargement des comptes.",
    loadMore: "Charger plus",
    allRolesPlaceholder: "Tous les rôles",
    allStatusesPlaceholder: "Tous les statuts",
    allOption: "Tous",
    roleUser: "Utilisateur",
    suspendAccountTitle: "Suspendre le compte",
    // Genuine cognate — "permanent" is spelled identically in French.
    durationPermanent: "Permanent",
    status: {
      active: "Actif",
      suspended: "Suspendu",
    },
    table: {
      email: "E-mail",
      name: "Nom",
      role: "Rôle",
      status: "Statut",
      created: "Créé",
    },
    detail: {
      loading: "Chargement…",
      loadFailed: "Échec du chargement du compte.",
      identityTitle: "Identité",
      twoFactorLabel: "Double authentification",
      twoFactorEnabled: "Activée",
      twoFactorDisabled: "Désactivée",
      memberSinceLabel: "Membre depuis",
      accountStatusTitle: "Statut du compte",
      reactivate: "Réactiver",
      suspend: "Suspendre",
      impersonate: "Emprunter l'identité",
      impersonateDialogTitle: "Emprunter l'identité du compte",
      reasonLabel: "Motif",
      expiresLabel: "Expire",
      revokeSessions: "Révoquer les sessions",
      resetPassword: "Réinitialiser le mot de passe",
      // "Compte" agrees masculine — these describe the account, never the
      // person, so no gender is imposed on someone whose gender is unknown.
      banSuccessToast: "Compte suspendu.",
      unbanSuccessToast: "Compte réactivé.",
      impersonateSuccessToast: "Emprunt d'identité démarré.",
      revokeSessionsSuccessToast: "Sessions révoquées.",
      resetPasswordSuccessToast: "E-mail de réinitialisation du mot de passe envoyé.",
    },
    sessions: {
      title: "Sessions actives ({{count}})",
      empty: "Aucune session active.",
      // Acronym, identical in both languages.
      ipHeader: "IP",
      browserHeader: "Navigateur",
      createdHeader: "Créé",
      expiresHeader: "Expire",
      // "Type" is the same word in French too, matching the "Actions" /
      // "Webhooks" cognate exemptions already in the parity gate.
      typeHeader: "Type",
      typeImpersonation: "Emprunt d'identité",
      // "Normal" is spelled identically in French too — a genuine cognate.
      typeNormal: "Normal",
    },
    banForm: {
      reasonLabel: "Motif",
      reasonPlaceholder: "Motif de la suspension…",
      durationLabel: "Durée",
      duration24h: "24 heures",
      duration7d: "7 jours",
      duration30d: "30 jours",
    },
    impersonateForm: {
      reasonLabel: "Motif",
      reasonPlaceholder: "Décrivez le motif de l'emprunt d'identité…",
      ticketRefLabel: "Référence du ticket (optionnel)",
      ticketRefPlaceholder: "SUP-42",
      submit: "Démarrer l'emprunt d'identité",
    },
  },
} as const;
