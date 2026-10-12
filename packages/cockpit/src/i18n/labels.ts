import type {
  AgentRole,
  AuditReason,
  AuditState,
  BaseTestResult,
  BranchTestResult,
  BeforeProofKind,
  EffortLevel,
  GateStepOutcome,
  IssueState,
  IssueType,
  RateLimitWindow,
  ReleaseState,
  RequestState,
  ReviewCategory,
  ReviewSeverity,
} from '@agent-factory/domain';
import type {
  AgentRunOutcome,
  AlertSeverity,
  AlertState,
  AttemptKind,
  AttemptOutcome,
  AuditFindingLevel,
  BeforeResult,
  ChallengeVerdict,
  CheckConclusion,
  CheckKind,
  DecisionStatus,
  DeploymentOutcome,
  EnvironmentName,
  EnvironmentStatus,
  MemoryPressure,
  PodStatus,
  PullRequestState,
  RunStatus,
  SourceKind,
  ToolStatus,
  WorkflowStatus,
  WorkflowTrigger,
} from '../contract/index.ts';
import type { ConnectionStatus } from '../data/state.ts';

export const ISSUE_STATE_LABELS: Readonly<Record<IssueState, string>> = {
  'spec-draft': 'Spec à valider',
  'spec-validated': 'En file',
  blocked: 'Bloquée',
  'authoring-checks': 'Écriture des checks',
  'checks-frozen': 'Checks gelés',
  'rewriting-check': 'Réécriture d’un check',
  implementing: 'Implémentation',
  gating: 'Gate',
  reviewing: 'Revue',
  'producing-evidence': 'Preuves',
  'pr-open': 'PR ouverte',
  ci: 'CI',
  'ready-to-merge': 'Prête à merger',
  merged: 'Mergée',
  'in-dev': 'En DEV',
  'in-release': 'En release',
  'in-prep': 'En PREP',
  'in-prod': 'En PROD',
  closed: 'Fermée',
  abandoned: 'Abandonnée',
  'needs-human': 'Intervention requise',
};

export const BASE_TEST_RESULT_LABELS: Readonly<Record<BaseTestResult, string>> = {
  'red-assertion': 'rouge (assertion)',
  'red-error': 'rouge (erreur)',
  green: 'vert',
  skipped: 'ignoré',
};

export const BRANCH_TEST_RESULT_LABELS: Readonly<Record<BranchTestResult, string>> = {
  green: 'vert',
  red: 'rouge',
  skipped: 'ignoré',
  missing: 'absent',
  'not-run': 'non exécuté',
};

export const ISSUE_TYPE_LABELS: Readonly<Record<IssueType, string>> = {
  ui: 'UI',
  'skill-prompt': 'Skill / prompt',
  'engine-api': 'Moteur / API',
  security: 'Sécurité',
  'infra-ci': 'Infra / CI',
  data: 'Données',
  dependencies: 'Dépendances',
  doc: 'Doc',
  release: 'Release',
  refactor: 'Refactor',
};

export const ROLE_LABELS: Readonly<Record<AgentRole, string>> = {
  challenger: 'Challengeur',
  'acceptance-author': 'Auteur des checks',
  implementer: 'Implémenteur',
  reviewer: 'Relecteur',
  auditor: 'Auditeur',
  'release-auditor': 'Auditeur de release',
  summarizer: 'Synthétiseur',
};

export const EFFORT_LABELS: Readonly<Record<EffortLevel, string>> = {
  low: 'Faible',
  medium: 'Moyen',
  high: 'Élevé',
  xhigh: 'Très élevé',
  max: 'Maximum',
};

export const REQUEST_STATE_LABELS: Readonly<Record<RequestState, string>> = {
  received: 'Reçue',
  challenging: 'En challenge',
  challenged: 'Challengée',
  accepted: 'Acceptée',
  declined: 'Déclinée',
  'waiting-requester': 'Attente demandeur',
};

export const RELEASE_STATE_LABELS: Readonly<Record<ReleaseState, string>> = {
  open: 'Ouverte',
  cut: 'Coupée',
  auditing: 'En audit',
  blocked: 'Bloquée',
  promotable: 'Promouvable',
  promoted: 'Promue',
  verified: 'Vérifiée',
};

export const AUDIT_STATE_LABELS: Readonly<Record<AuditState, string>> = {
  detected: 'Détecté',
  auditing: 'En audit',
  keep: 'Conserver',
  challenge: 'À challenger',
  rewrite: 'À réécrire',
};

export const AUDIT_REASON_LABELS: Readonly<Record<AuditReason, string>> = {
  'direct-push': 'Push direct',
  'bot-author': 'Auteur bot',
  'branch-not-factory': 'Branche hors usine',
  'missing-factory-label': 'Label factory manquant',
  'on-demand': 'Demandé par l\'opérateur',
};

export const AUDIT_FINDING_LEVEL_LABELS: Readonly<Record<AuditFindingLevel, string>> = {
  intent: 'Intention',
  idea: 'Idée',
  method: 'Méthode',
};

export const CHALLENGE_VERDICT_LABELS: Readonly<Record<ChallengeVerdict, string>> = {
  keep: 'Garder',
  adjust: 'Ajuster',
  split: 'Découper',
  ask: 'Question',
  decline: 'Décliner',
};

export const RUN_STATUS_LABELS: Readonly<Record<RunStatus, string>> = {
  running: 'En cours',
  waiting: 'Attend une réponse',
  succeeded: 'Réussi',
  failed: 'Échoué',
  stopped: 'Arrêté',
};

export const RUN_OUTCOME_LABELS: Readonly<Record<AgentRunOutcome, string>> = {
  success: 'Succès',
  'decision-requested': 'Décision demandée',
  'max-turns': 'Tours max atteints',
  'budget-exceeded': 'Budget dépassé',
  error: 'Erreur',
  timeout: 'Délai dépassé',
  aborted: 'Interrompu',
};

export const REVIEW_SEVERITY_LABELS: Readonly<Record<ReviewSeverity, string>> = {
  blocking: 'Bloquant',
  'non-blocking': 'Non bloquant',
};

export const REVIEW_CATEGORY_LABELS: Readonly<Record<ReviewCategory, string>> = {
  'criteria-coverage': 'Couverture des critères',
  'scope-creep': 'Hors périmètre',
  'check-integrity': 'Intégrité des checks',
  correctness: 'Exactitude',
  security: 'Sécurité',
  'repository-rules': 'Règles du dépôt',
};

export const CHECK_CONCLUSION_LABELS: Readonly<Record<CheckConclusion, string>> = {
  success: 'Réussi',
  failure: 'Échec',
  pending: 'En cours',
  neutral: 'Neutre',
  skipped: 'Ignoré',
  cancelled: 'Annulé',
};

export const GATE_STEP_OUTCOME_LABELS: Readonly<Record<GateStepOutcome, string>> = {
  passed: 'Réussi',
  failed: 'Échec',
  skipped: 'Ignoré',
};

export const PULL_REQUEST_STATE_LABELS: Readonly<Record<PullRequestState, string>> = {
  open: 'Ouverte',
  merged: 'Mergée',
  closed: 'Fermée',
};

export const ENVIRONMENT_LABELS: Readonly<Record<EnvironmentName, string>> = {
  dev: 'DEV',
  prep: 'PREP',
  prod: 'PROD',
};

export const ENVIRONMENT_STATUS_LABELS: Readonly<Record<EnvironmentStatus, string>> = {
  healthy: 'Sain',
  degraded: 'Dégradé',
  deploying: 'Déploiement en cours',
  down: 'Indisponible',
};

export const DEPLOYMENT_OUTCOME_LABELS: Readonly<Record<DeploymentOutcome, string>> = {
  success: 'Réussi',
  failure: 'Échec',
  'in-progress': 'En cours',
};

export const WORKFLOW_STATUS_LABELS: Readonly<Record<WorkflowStatus, string>> = {
  queued: 'En file',
  in_progress: 'En cours',
  completed: 'Terminé',
};

export const WORKFLOW_TRIGGER_LABELS: Readonly<Record<WorkflowTrigger, string>> = {
  push: 'push',
  pull_request: 'pull request',
  workflow_dispatch: 'manuel',
  schedule: 'planifié',
  release: 'release',
};

export const MEMORY_PRESSURE_LABELS: Readonly<Record<MemoryPressure, string>> = {
  normal: 'normale',
  warn: 'élevée',
  critical: 'critique',
};

export const TOOL_STATUS_LABELS: Readonly<Record<ToolStatus, string>> = {
  connected: 'Connecté',
  unauthenticated: 'Non authentifié',
  missing: 'Absent',
  error: 'Erreur',
};

export const WINDOW_LABELS: Readonly<Record<RateLimitWindow, string>> = {
  five_hour: 'Fenêtre 5 h',
  seven_day: 'Hebdomadaire',
};

export const WINDOW_SHORT_LABELS: Readonly<Record<RateLimitWindow, string>> = {
  five_hour: '5 h',
  seven_day: '7 j',
};

export const CHECK_KIND_LABELS: Readonly<Record<CheckKind, string>> = {
  playwright: 'Parcours Playwright',
  unit: 'Test unitaire',
  integration: 'Test d’intégration',
  evaluation: 'Cas d’évaluation',
  policy: 'Politique',
  migration: 'Test de migration',
};

export const BEFORE_RESULT_LABELS: Readonly<Record<BeforeResult, string>> = {
  failed: 'Échoue sur la base',
  passed: 'Passe sur la base',
  scored: 'Score de base',
  'not-run': 'Non exécuté',
};

export const BEFORE_PROOF_KIND_LABELS: Readonly<Record<BeforeProofKind, string>> = {
  'fails-on-base': 'Échec attendu sur la base',
  'base-score': 'Score de base',
  none: 'Aucune preuve avant',
};

export const ATTEMPT_KIND_LABELS: Readonly<Record<AttemptKind, string>> = {
  session: 'Session',
  correction: 'Correction',
  'fresh-session': 'Nouvelle session',
};

export const ATTEMPT_OUTCOME_LABELS: Readonly<Record<AttemptOutcome, string>> = {
  running: 'En cours',
  passed: 'Réussie',
  'gate-failed': 'Gate en échec',
  'review-failed': 'Revue en échec',
  error: 'Erreur',
};

export const POD_STATUS_LABELS: Readonly<Record<PodStatus, string>> = {
  running: 'En marche',
  pending: 'En attente',
  'crash-loop': 'Crash en boucle',
  terminated: 'Terminé',
};

export const ALERT_SEVERITY_LABELS: Readonly<Record<AlertSeverity, string>> = {
  critical: 'Critique',
  warning: 'Avertissement',
  info: 'Info',
};

export const ALERT_STATE_LABELS: Readonly<Record<AlertState, string>> = {
  triggered: 'Déclenchée',
  resolved: 'Résolue',
};

export const DECISION_STATUS_LABELS: Readonly<Record<DecisionStatus, string>> = {
  accepted: 'Acceptée',
  proposed: 'Proposée',
  superseded: 'Remplacée',
};

export const SOURCE_KIND_LABELS: Readonly<Record<SourceKind, string>> = {
  repository: 'Dépôt',
  documentation: 'Documentation',
  design: 'Design',
  dashboard: 'Tableau de bord',
  channel: 'Canal',
};

export const CONNECTION_STATUS_LABELS: Readonly<Record<ConnectionStatus, string>> = {
  connecting: 'Connexion…',
  live: 'En direct',
  reconnecting: 'Reconnexion…',
  offline: 'Hors ligne',
};
