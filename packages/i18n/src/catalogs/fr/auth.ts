export default {
  signIn: {
    submit: "Se connecter",
    pending: "Connexion…",
    success: "Content de vous revoir",
    failed: "La connexion a échoué",
  },
  signUp: {
    submit: "Créer un compte",
    pending: "Création du compte…",
    passwordHint:
      "Au moins 15 caractères. Évitez les mots de passe exposés dans des fuites connues.",
    acceptPrefix: "J'accepte la",
    acceptSeparator: "et les",
    privacyPolicy: "politique de confidentialité",
    termsOfService: "conditions d'utilisation",
    failed: "L'inscription a échoué",
  },
  twoFactor: {
    invalidCode: "Code invalide",
    invalidBackupCode: "Code de secours invalide",
  },
  resetPassword: {
    failed: "La réinitialisation a échoué",
  },
  forgotPassword: {
    failed: "La demande a échoué",
  },
  magicLink: {
    failed: "L'envoi du lien a échoué",
  },
  passkey: {
    failed: "La connexion par clé d'accès a échoué",
  },
} as const;
