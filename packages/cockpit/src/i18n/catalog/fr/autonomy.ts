import type { TwinOf } from '../types.ts';
import type { enAutonomy } from '../en/autonomy.ts';

export const frAutonomy = {
  'autonomy.title': 'Décisions déléguées',
  'autonomy.description': 'Les gestes que {actor} a faits à votre place, du plus récent au plus ancien, chacun avec la raison donnée.',
  'autonomy.list': 'Décisions déléguées',
  'autonomy.none': 'Rien n’a été décidé sans vous',
  'autonomy.noneDescription': 'Chaque geste que le délégué fait avec --as apparaît ici, avec sa raison.',
  'autonomy.policy.label': 'Ce que ce projet délègue',
  'autonomy.policy.nothing': 'Rien n’est délégué : tous les gestes restent les vôtres.',
  'autonomy.policy.intro': '{actor} peut :',
  'autonomy.policy.validateSpecs': 'valider les specs',
  'autonomy.policy.answerDecisions': 'répondre aux décisions',
  'autonomy.policy.resume': 'reprendre les tickets',
  'autonomy.policy.merge': 'merger les pull requests des types {types}',
  'autonomy.policy.mergeWhen': 'merger les pull requests des types {types} quand {conditions}',
  'autonomy.condition.films-recorded': 'chaque film déclaré par la spec est enregistré et aucun n’a échoué ni n’est en attente',
  'autonomy.decision.issue': 'Ticket n° {number}',
  'autonomy.decision.pullRequest': 'Pull request n° {number}',
  'autonomy.decision.by': 'par {actor}',
  'autonomy.decision.reason': 'Raison : {reason}',
  'autonomy.decision.rule': 'Permis par {rule}',
  'autonomy.mark.title': 'Décidé sans vous',
  'autonomy.mark.description': 'Les gestes que {actor} a faits sur cet élément.',
} as const satisfies TwinOf<typeof enAutonomy>;
