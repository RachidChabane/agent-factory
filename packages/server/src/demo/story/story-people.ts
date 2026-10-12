import type { StoryPerson } from './story-types.ts';

export const REQUESTER_DANA = 'Dana Reyes';
export const REQUESTER_RILEY = 'Riley Chen';
export const REQUESTER_SAM = 'Sam Okafor';
export const REQUESTER_JORDAN = 'Jordan Lee';

export const DANA_REYES: StoryPerson = { name: REQUESTER_DANA, email: 'dana.reyes@example.com', login: 'dreyes' };

export const DEPENDENCY_BOT: StoryPerson = {
  name: 'dependency-bot[bot]',
  email: 'dependency-bot[bot]@users.noreply.example.com',
  login: 'dependency-bot[bot]',
};
