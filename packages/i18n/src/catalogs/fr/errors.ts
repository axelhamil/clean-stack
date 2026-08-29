export default {
  fallback: "Une erreur est survenue. Veuillez réessayer.",
  byCode: {
    ACCOUNT_EXPORT_RATE_LIMITED: "Vous pourrez demander un nouvel export dans 24 heures.",
    ACCOUNT_PASSWORD_REQUIRED: "Confirmez avec votre mot de passe.",
    ACCOUNT_DELETION_BLOCKED:
      "Réglez la propriété de vos organisations avant de supprimer votre compte.",
    ACCOUNT_DELETION_NOT_FOUND: "Aucune suppression à annuler.",
    ACCOUNT_PASSWORD_INVALID: "Mot de passe invalide.",
    TWO_FACTOR_REQUIRED: "Confirmez avec votre mot de passe ou votre code d'authentification.",
    TWO_FACTOR_INVALID: "Code d'authentification invalide.",
  },
  bySuffix: {
    RATE_LIMITED: "Trop de requêtes. Patientez un instant avant de réessayer.",
    NOT_FOUND: "Introuvable.",
    FORBIDDEN: "Vous n'avez pas la permission de faire cela.",
    UNAUTHORIZED: "Veuillez vous reconnecter.",
    REQUIRED: "Une confirmation supplémentaire est requise.",
    BLOCKED: "Action bloquée.",
    INVALID: "Saisie invalide.",
    INTEGRITY_FAILED: "Le contrôle d'intégrité a échoué. Veuillez réessayer.",
    PROVIDER_FAILURE: "Le service est temporairement indisponible. Veuillez réessayer.",
    UNAVAILABLE: "Le service est temporairement indisponible. Veuillez réessayer.",
    TIMEOUT: "La requête a expiré. Veuillez réessayer.",
  },
  validation: {
    required: "Ce champ est obligatoire.",
    invalidEmail: "Saisissez une adresse e-mail valide.",
    tooSmall: "Doit contenir au moins {{minimum}} caractères.",
    tooBig: "Doit contenir au plus {{maximum}} caractères.",
  },
} as const;
