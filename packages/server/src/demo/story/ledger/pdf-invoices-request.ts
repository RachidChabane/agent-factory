import { lines, paragraphs } from '../story-helpers.ts';
import { REQUESTER_JORDAN } from '../story-people.ts';
import type { StoryRequest } from '../story-types.ts';

const TITLE = 'Send invoices as PDF attachments';

export const PDF_INVOICES: StoryRequest = {
  key: 'pdf-invoices',
  title: TITLE,
  requester: REQUESTER_JORDAN,
  body: `${paragraphs(
    `# ${TITLE}`,
    'Hello team,',
    'Customers keep asking for a copy of their invoice that they can forward to their accountant. Today they get an email with a link to the invoice page, and about one in five of them replies to ask for a PDF.',
    'What I would like: when an invoice is issued, the email carries the invoice as a PDF attachment, with the lines, the VAT and the total as they appear on the page. A customer who pays by card should get the receipt as a PDF too.',
    'I do not mind how it is generated, as long as the numbers match the page to the cent.',
    lines('Thanks,', 'Jordan'),
  )}\n`,
  challenge: null,
  accept: [],
};
