import type { TwinOf } from '../types.ts';
import type { enVocabulary } from '../en/vocabulary.ts';

export const frVocabulary = {
  'vocab.issueState.spec-draft': 'Spec à valider',
  'vocab.issueState.spec-validated': 'En file',
  'vocab.issueState.blocked': 'Bloquée',
  'vocab.issueState.authoring-checks': 'Écriture des checks',
  'vocab.issueState.checks-frozen': 'Checks gelés',
  'vocab.issueState.rewriting-check': 'Réécriture d’un check',
  'vocab.issueState.implementing': 'Implémentation',
  'vocab.issueState.gating': 'Gate',
  'vocab.issueState.reviewing': 'Revue',
  'vocab.issueState.producing-evidence': 'Production des preuves',
  'vocab.issueState.pr-open': 'Pull request ouverte',
  'vocab.issueState.ci': 'CI',
  'vocab.issueState.ready-to-merge': 'Prête à merger',
  'vocab.issueState.merged': 'Mergée',
  'vocab.issueState.in-dev': 'En dev',
  'vocab.issueState.in-release': 'En release',
  'vocab.issueState.in-prep': 'En pré-production',
  'vocab.issueState.in-prod': 'En production',
  'vocab.issueState.closed': 'Fermée',
  'vocab.issueState.abandoned': 'Abandonnée',
  'vocab.issueState.needs-human': 'Intervention requise',

  'vocab.requestState.received': 'Reçue',
  'vocab.requestState.challenging': 'En challenge',
  'vocab.requestState.challenged': 'Challengée',
  'vocab.requestState.accepted': 'Acceptée',
  'vocab.requestState.declined': 'Déclinée',
  'vocab.requestState.waiting-requester': 'En attente du demandeur',

  'vocab.releaseState.open': 'Ouverte',
  'vocab.releaseState.cut': 'Coupée',
  'vocab.releaseState.auditing': 'En audit',
  'vocab.releaseState.blocked': 'Bloquée',
  'vocab.releaseState.promotable': 'Promouvable',
  'vocab.releaseState.promoted': 'Promue',
  'vocab.releaseState.verified': 'Vérifiée',

  'vocab.releaseSource.pull-request': 'Pull request de release',
  'vocab.releaseSource.tag': 'Tag',

  'vocab.auditState.detected': 'Détecté',
  'vocab.auditState.auditing': 'En audit',
  'vocab.auditState.keep': 'Conserver',
  'vocab.auditState.challenge': 'À challenger',
  'vocab.auditState.rewrite': 'À réécrire',

  'vocab.auditReason.direct-push': 'Push direct',
  'vocab.auditReason.bot-author': 'Auteur bot',
  'vocab.auditReason.branch-not-factory': 'Branche hors usine',
  'vocab.auditReason.missing-factory-label': 'Label de l’usine manquant',
  'vocab.auditReason.on-demand': 'Demandé par l’opérateur',

  'vocab.auditFindingLevel.intent': 'Intention',
  'vocab.auditFindingLevel.idea': 'Idée',
  'vocab.auditFindingLevel.method': 'Méthode',

  'vocab.commitAttribution.factory-merge': 'Merge de l’usine',
  'vocab.commitAttribution.automation': 'Autre automatisation',
  'vocab.commitAttribution.audit': 'Changement audité',

  'vocab.challengeVerdict.keep': 'Conserver',
  'vocab.challengeVerdict.adjust': 'Ajuster',
  'vocab.challengeVerdict.split': 'Découper',
  'vocab.challengeVerdict.ask': 'Question',
  'vocab.challengeVerdict.decline': 'Décliner',

  'vocab.runStatus.running': 'En cours',
  'vocab.runStatus.waiting': 'Attend une réponse',
  'vocab.runStatus.succeeded': 'Réussi',
  'vocab.runStatus.failed': 'Échec',
  'vocab.runStatus.stopped': 'Arrêté',

  'vocab.runOutcome.success': 'Succès',
  'vocab.runOutcome.decision-requested': 'Décision demandée',
  'vocab.runOutcome.max-turns': 'Limite de tours atteinte',
  'vocab.runOutcome.budget-exceeded': 'Budget dépassé',
  'vocab.runOutcome.error': 'Erreur',
  'vocab.runOutcome.timeout': 'Délai dépassé',
  'vocab.runOutcome.aborted': 'Interrompu',

  'vocab.runSubjectKind.issue': 'Issue',
  'vocab.runSubjectKind.request': 'Demande',
  'vocab.runSubjectKind.audit': 'Audit',
  'vocab.runSubjectKind.release': 'Release',

  'vocab.subagentStatus.running': 'En cours',
  'vocab.subagentStatus.done': 'Terminé',
  'vocab.subagentStatus.failed': 'Échec',

  'vocab.role.challenger': 'Challengeur',
  'vocab.role.acceptance-author': 'Auteur des checks',
  'vocab.role.implementer': 'Implémenteur',
  'vocab.role.reviewer': 'Relecteur',
  'vocab.role.auditor': 'Auditeur',
  'vocab.role.release-auditor': 'Auditeur de release',
  'vocab.role.summarizer': 'Synthétiseur',

  'vocab.effort.low': 'Faible',
  'vocab.effort.medium': 'Moyen',
  'vocab.effort.high': 'Élevé',
  'vocab.effort.xhigh': 'Très élevé',
  'vocab.effort.max': 'Maximum',

  'vocab.reviewSeverity.blocking': 'Bloquant',
  'vocab.reviewSeverity.non-blocking': 'Non bloquant',

  'vocab.reviewCategory.criteria-coverage': 'Couverture des critères',
  'vocab.reviewCategory.scope-creep': 'Dérive du périmètre',
  'vocab.reviewCategory.check-integrity': 'Intégrité des checks',
  'vocab.reviewCategory.correctness': 'Exactitude',
  'vocab.reviewCategory.security': 'Sécurité',
  'vocab.reviewCategory.repository-rules': 'Règles du dépôt',

  'vocab.checkConclusion.success': 'Réussi',
  'vocab.checkConclusion.failure': 'Échec',
  'vocab.checkConclusion.pending': 'En attente',
  'vocab.checkConclusion.neutral': 'Neutre',
  'vocab.checkConclusion.skipped': 'Ignoré',
  'vocab.checkConclusion.cancelled': 'Annulé',

  'vocab.checkRunOutcome.passed': 'Réussi',
  'vocab.checkRunOutcome.failed': 'Échec',

  'vocab.gateStepOutcome.passed': 'Réussi',
  'vocab.gateStepOutcome.failed': 'Échec',
  'vocab.gateStepOutcome.skipped': 'Ignoré',

  'vocab.pullRequestState.open': 'Ouverte',
  'vocab.pullRequestState.merged': 'Mergée',
  'vocab.pullRequestState.closed': 'Fermée',

  'vocab.environmentStatus.healthy': 'Sain',
  'vocab.environmentStatus.degraded': 'Dégradé',
  'vocab.environmentStatus.deploying': 'Déploiement en cours',
  'vocab.environmentStatus.down': 'Indisponible',
  'vocab.environmentStatus.unknown': 'Inconnu',

  'vocab.deploymentOutcome.success': 'Réussi',
  'vocab.deploymentOutcome.failure': 'Échec',
  'vocab.deploymentOutcome.in-progress': 'En cours',

  'vocab.workflowStatus.queued': 'En file',
  'vocab.workflowStatus.in_progress': 'En cours',
  'vocab.workflowStatus.completed': 'Terminé',

  'vocab.promotionPolicy.automatic': 'Automatique',
  'vocab.promotionPolicy.batch': 'Par lots de release',
  'vocab.promotionPolicy.manual': 'Manuelle',

  'vocab.releaseModel.release-please': 'Pull requests de release',
  'vocab.releaseModel.tags': 'Tags',
  'vocab.releaseModel.none': 'Aucun modèle de release',

  'vocab.memoryPressure.normal': 'normale',
  'vocab.memoryPressure.warn': 'élevée',
  'vocab.memoryPressure.critical': 'critique',

  'vocab.toolSessionOutcome.succeeded': 'Réussie',
  'vocab.toolSessionOutcome.failed': 'Échec',
  'vocab.toolSessionOutcome.timed-out': 'Délai dépassé',
  'vocab.toolStatus.connected': 'Connecté',
  'vocab.toolStatus.unauthenticated': 'Non connecté',
  'vocab.toolStatus.missing': 'Absent',
  'vocab.toolStatus.error': 'Erreur',

  'vocab.referenceSnapshotStatus.ready': 'Instantané prêt',
  'vocab.referenceSnapshotStatus.missing-ref': 'Ref absente de la source',
  'vocab.referenceSnapshotStatus.not-built': 'Instantané non construit',

  'vocab.toolScope.installation': 'Installation',
  'vocab.toolScope.project': 'Projet',

  'vocab.usageLimitKind.session': 'Session',
  'vocab.usageLimitKind.weekly_all': 'Hebdomadaire, tous modèles',
  'vocab.usageLimitKind.weekly_scoped': 'Hebdomadaire, un modèle',

  'vocab.usageFreshness.fresh': 'À jour',
  'vocab.usageFreshness.stale': 'Périmé',
  'vocab.usageFreshness.window-reset': 'Fenêtre réinitialisée',

  'vocab.usageSource.usage-report': 'Rapport d’usage',
  'vocab.usageSource.agent-stream': 'Flux d’un agent',

  'vocab.billing.subscription': 'Abonnement',
  'vocab.billing.api-key': 'Clé d’API',

  'vocab.costBasis.subscription-equivalent': 'Prix API équivalent de l’usage de l’abonnement',
  'vocab.costBasis.metered': 'Prix API facturé',
  'vocab.costBasis.mixed': 'Mixte : facturé et équivalent d’abonnement',

  'vocab.pauseCause.resources': 'Ressources de la machine',
  'vocab.pauseCause.budget': 'Budget',
  'vocab.pauseCause.operator': 'Opérateur',
  'vocab.pauseCause.drain': 'Arrêt en cours',

  'vocab.pauseScope.installation': 'Installation',
  'vocab.pauseScope.project': 'Projet',

  'vocab.attemptKind.session': 'Session',
  'vocab.attemptKind.correction': 'Correction',
  'vocab.attemptKind.fresh-session': 'Nouvelle session',

  'vocab.attemptOutcome.running': 'En cours',
  'vocab.attemptOutcome.passed': 'Réussie',
  'vocab.attemptOutcome.gate-failed': 'Gate en échec',
  'vocab.attemptOutcome.review-failed': 'Revue en échec',
  'vocab.attemptOutcome.error': 'Erreur',

  'vocab.beforeResult.failed': 'Échoue sur la base',
  'vocab.beforeResult.passed': 'Passe sur la base',
  'vocab.beforeResult.scored': 'Score de base',
  'vocab.beforeResult.not-run': 'Non exécuté',

  'vocab.beforeProofKind.fails-on-base': 'Doit échouer sur la base',
  'vocab.beforeProofKind.base-score': 'Score de base enregistré',
  'vocab.beforeProofKind.none': 'Aucune preuve avant',

  'vocab.baseExpectation.fails': 'Doit échouer sur la base',
  'vocab.baseExpectation.passes': 'Doit passer sur la base',

  'vocab.baseTestResult.red-assertion': 'Rouge (assertion)',
  'vocab.baseTestResult.red-error': 'Rouge (erreur)',
  'vocab.baseTestResult.green': 'Vert',
  'vocab.baseTestResult.skipped': 'Ignoré',

  'vocab.branchTestResult.green': 'Vert',
  'vocab.branchTestResult.red': 'Rouge',
  'vocab.branchTestResult.skipped': 'Ignoré',
  'vocab.branchTestResult.missing': 'Absent',
  'vocab.branchTestResult.not-run': 'Non exécuté',

  'vocab.proofStrategy.fails-on-base': 'Échoue sur la base',
  'vocab.proofStrategy.fails-on-base-when-expressible': 'Échoue sur la base quand c’est possible',
  'vocab.proofStrategy.base-score': 'Score de base',
  'vocab.proofStrategy.none': 'Aucune preuve avant',

  'vocab.testRunner.pytest': 'pytest',
  'vocab.testRunner.vitest': 'Vitest',
  'vocab.testRunner.playwright': 'Playwright',
  'vocab.testRunner.node-test': 'Lanceur de tests Node',
  'vocab.testRunner.eval': 'Évaluation',

  'vocab.evidenceKind.image-compare': 'Avant et après',
  'vocab.evidenceKind.recording': 'Enregistrement',
  'vocab.evidenceKind.red-green': 'Du rouge au vert',
  'vocab.evidenceKind.acceptance-tests': 'Tests d’acceptation',
  'vocab.evidenceKind.eval-scores': 'Scores d’évaluation',
  'vocab.evidenceKind.report': 'Rapport',

  'vocab.forgeKind.github': 'GitHub',
  'vocab.forgeKind.local': 'Forge locale',

  'vocab.installationMode.live': 'Production',
  'vocab.installationMode.demo': 'Démo',
  'vocab.installationMode.rehearsal': 'Répétition',

  'vocab.notificationChannel.system': 'Notification système',
  'vocab.notificationChannel.google-chat': 'Google Chat',
  'vocab.notificationChannel.slack': 'Slack',
  'vocab.notificationChannel.webhook': 'Webhook',

  'vocab.remoteAccess.none': 'Aucun',
  'vocab.remoteAccess.tailscale': 'Tailscale',

  'vocab.knowledgeSourceKind.path': 'Dossier',
  'vocab.knowledgeSourceKind.repository': 'Dépôt',

  'vocab.issueType.feature': 'Fonctionnalité',
  'vocab.issueType.fix': 'Correctif',
  'vocab.issueType.ui': 'UI',
  'vocab.issueType.api': 'API',
  'vocab.issueType.security': 'Sécurité',
  'vocab.issueType.infra': 'Infrastructure et CI',
  'vocab.issueType.data': 'Données',
  'vocab.issueType.dependencies': 'Dépendances',
  'vocab.issueType.docs': 'Documentation',
  'vocab.issueType.refactor': 'Refactorisation',
  'vocab.issueType.release': 'Release',
  'vocab.issueType.prompt': 'Prompt',
  'vocab.gesture.validate-spec': 'Spec validée',
  'vocab.gesture.answer-decision': 'Décision tranchée',
  'vocab.gesture.resume': 'Ticket repris',
  'vocab.gesture.merge': 'Pull request mergée',
} as const satisfies TwinOf<typeof enVocabulary>;
