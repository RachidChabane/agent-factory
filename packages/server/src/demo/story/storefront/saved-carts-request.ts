import { lines, paragraphs } from '../story-helpers.ts';
import { REQUESTER_RILEY } from '../story-people.ts';
import type { StoryRequest } from '../story-types.ts';

const TITLE = 'Let customers save a cart for later';

export const SAVED_CARTS: StoryRequest = {
  key: 'saved-carts',
  title: TITLE,
  requester: REQUESTER_RILEY,
  body: `${paragraphs(
    `# ${TITLE}`,
    'Hi all,',
    'I keep hearing the same thing from people who browse on their phone during the day and want to check out in the evening: the cart is gone by the time they come back, or it is on the wrong device.',
    'I would like customers to be able to save a cart and come back to it later, ideally from another device. I am not sure whether that means accounts, a link they can email themselves, or something simpler.',
    'Success for me is that someone who saved a cart on Monday can check out with the same items on Wednesday.',
    lines('Thanks,', 'Riley'),
  )}\n`,
  challenge: null,
  accept: [],
};
