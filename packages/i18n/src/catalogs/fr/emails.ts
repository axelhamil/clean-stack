export default {
  subjects: {
    verifyEmail: "Confirmez votre adresse e-mail",
    resetPassword: "Réinitialisez votre mot de passe",
    magicLink: "Votre lien de connexion",
    orgInvitation: "Vous avez été invité à rejoindre {{orgName}}",
    dataExportReady: "Votre export de données est prêt",
    deleteRequested: "Suppression de compte demandée",
    deleteCancelled: "Suppression de compte annulée",
    deleteCompleted: "Votre compte a été supprimé",
    changeEmail: "Confirmez votre nouvelle adresse e-mail",
    backupCodeUsed: "Un code de secours a été utilisé",
    impersonationStarted: "Accès support à votre compte",
    apiTokenLeaked: "Votre jeton d'API a été révoqué automatiquement",
    notificationDigest_one: "{{count}} nouvelle notification {{category}}",
    notificationDigest_other: "{{count}} nouvelles notifications {{category}}",
  },
  layout: {
    footer: "Si vous n'attendiez pas cet e-mail, vous pouvez l'ignorer.",
  },
  verifyEmail: {
    heading: "Confirmez votre e-mail",
    body: "Bonjour {{name}}, confirmez votre adresse pour finaliser la création de votre compte.",
    cta: "Confirmer l'e-mail",
  },
  resetPassword: {
    heading: "Réinitialisez votre mot de passe",
    body: "Bonjour {{name}}, cliquez sur le bouton ci-dessous pour réinitialiser votre mot de passe. Le lien expire dans 1 heure.",
    cta: "Réinitialiser le mot de passe",
  },
  magicLink: {
    heading: "Connectez-vous à votre compte",
    body: "Cliquez sur le bouton ci-dessous pour vous connecter. Ce lien est à usage unique et expire rapidement.",
    cta: "Se connecter",
  },
  orgInvitation: {
    heading: "Vous avez été invité",
    body: "{{inviterName}} vous invite à rejoindre <org>{{orgName}}</org> en tant que {{role}}.",
    cta: "Accepter l'invitation",
  },
  dataExportReady: {
    heading: "Votre export de données est prêt",
    body: "Bonjour {{name}}, votre export de données est prêt à être téléchargé. Le lien expire le {{expiresAt}}.",
    cta: "Télécharger l'export",
  },
  deleteRequested: {
    heading: "Suppression de compte demandée",
    body: "Bonjour {{name}}, nous avons reçu une demande de suppression de votre compte. La suppression sera effectuée le {{expiresAt}}. Si vous n'êtes pas à l'origine de cette demande, annulez-la dès maintenant.",
    cta: "Annuler la suppression",
  },
  deleteCancelled: {
    heading: "Suppression de compte annulée",
    body: "Bonjour {{name}}, votre demande de suppression de compte a été annulée. Votre compte reste actif.",
  },
  deleteCompleted: {
    heading: "Votre compte a été supprimé",
    body: "Bonjour {{name}}, votre compte et toutes les données associées ont été définitivement supprimés.",
  },
  changeEmail: {
    heading: "Confirmez votre nouvelle adresse e-mail",
    body: "Bonjour {{name}}, confirmez que vous souhaitez remplacer votre adresse e-mail par {{newEmail}}.",
    cta: "Confirmer la nouvelle adresse",
  },
  backupCodeUsed: {
    heading: "Un code de secours a été utilisé",
    body: "Un code de secours d'authentification à deux facteurs vient d'être utilisé pour vous connecter. Si vous n'êtes pas à l'origine de cette connexion, vérifiez immédiatement la sécurité de votre compte.",
    cta: "Vérifier les paramètres de sécurité",
  },
  impersonationStarted: {
    heading: "Accès support à votre compte",
    body: "Bonjour {{userName}}, un membre de notre équipe support a accédé à votre compte à des fins de diagnostic le {{startedAt}}. Cet accès expirera automatiquement le {{expiresAt}}.",
    reason: "Motif indiqué : {{reason}}",
    scope:
      "Cet accès est limité dans le temps et ne permet pas de modifier votre mot de passe, vos informations de paiement ni vos identifiants de connexion.",
    concerns:
      "Si vous n'avez pas contacté notre support ou si cet accès vous préoccupe, contactez-nous immédiatement.",
    cta: "Contacter le support",
  },
  apiTokenLeaked: {
    heading: "Jeton d'API révoqué",
    greeting: "Bonjour {{name}},",
    body: "Votre jeton d'API <token>{{tokenName}}</token> a été détecté dans un dépôt public et a été automatiquement révoqué le {{revokedAt}} afin de protéger votre compte.",
    help: "Si vous pensez qu'il s'agit d'une erreur ou si vous devez régénérer le jeton, vous pouvez le faire dans les paramètres de votre compte.",
  },
  notificationDigest: {
    intro: "Voici un résumé de votre activité {{category}} récente :",
  },
} as const;
