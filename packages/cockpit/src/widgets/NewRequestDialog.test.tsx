import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectCommand } from '../test/commands.ts';
import type { RenderOptions } from '../test/harness.tsx';
import { renderWidget } from '../test/harness.tsx';
import { fixtureSnapshot } from '../test/render.tsx';
import { MAX_ATTACHMENTS } from './attachment-intake.ts';
import { NewRequestDialog } from './NewRequestDialog.tsx';

const TITLE = 'Offline wishlist';
const BODY = 'Let customers browse their wishlist without a connection.';

function png(name: string, content = name): File {
  return new File([content], name, { type: 'image/png' });
}

function base64Of(content: string): string {
  return btoa(content);
}

interface DialogOptions extends RenderOptions {
  readonly projectId?: string | null;
  readonly pickProject?: boolean;
}

function renderDialog({ projectId = 'storefront', pickProject = false, ...options }: DialogOptions = {}) {
  return renderWidget(<NewRequestDialog open onClose={vi.fn()} projectId={projectId} pickProject={pickProject} />, options);
}

const dialogAlert = () => within(screen.getByRole('dialog')).getByRole('alert');

async function fillIn(view: Awaited<ReturnType<typeof renderDialog>>) {
  await view.user.type(screen.getByRole('textbox', { name: 'Title' }), TITLE);
  await view.user.type(screen.getByRole('textbox', { name: 'Request text' }), BODY);
}

describe('NewRequestDialog', () => {
  it('records the request for the project, with the operator as the requester and no attachment', async () => {
    const view = await renderDialog();
    expect(screen.getByRole('textbox', { name: 'Requester' })).toHaveValue('Alex Morgan');
    await fillIn(view);
    await view.user.click(screen.getByRole('button', { name: 'Save the request' }));
    await expectCommand(view.transport, 'request.create', { project: 'storefront', title: TITLE, requester: 'Alex Morgan', body: BODY, attachments: [] });
  });

  it('sends the requester as edited and trims every field', async () => {
    const view = await renderDialog();
    await view.user.type(screen.getByRole('textbox', { name: 'Title' }), `  ${TITLE}  `);
    await view.user.clear(screen.getByRole('textbox', { name: 'Requester' }));
    await view.user.type(screen.getByRole('textbox', { name: 'Requester' }), ' Dana Reyes ');
    await view.user.type(screen.getByRole('textbox', { name: 'Request text' }), `\n${BODY}\n`);
    await view.user.click(screen.getByRole('button', { name: 'Save the request' }));
    await expectCommand(view.transport, 'request.create', { project: 'storefront', title: TITLE, requester: 'Dana Reyes', body: BODY, attachments: [] });
  });

  it('asks for what is missing and sends nothing until the title, the requester and the text are given', async () => {
    const view = await renderDialog();
    await view.user.clear(screen.getByRole('textbox', { name: 'Requester' }));
    await view.user.click(screen.getByRole('button', { name: 'Save the request' }));
    expect(await screen.findByText('Give the request a short title.')).toBeInTheDocument();
    expect(screen.getByText('Say who is asking.')).toBeInTheDocument();
    expect(screen.getByText('Paste the text of the request.')).toBeInTheDocument();
    expect(view.transport.commands).toEqual([]);
  });

  it('lets the operator pick the project when the request is not tied to one', async () => {
    const view = await renderDialog({ projectId: null, pickProject: true, snapshot: await fixtureSnapshot() });
    await view.user.selectOptions(screen.getByRole('combobox', { name: 'Project' }), 'ledger');
    await fillIn(view);
    await view.user.click(screen.getByRole('button', { name: 'Save the request' }));
    await expectCommand(view.transport, 'request.create', { project: 'ledger', title: TITLE, requester: 'Alex Morgan', body: BODY, attachments: [] });
  });

  it('offers no project choice when the request belongs to the project being viewed', async () => {
    await renderDialog();
    expect(screen.queryByRole('combobox', { name: 'Project' })).not.toBeInTheDocument();
  });

  it('attaches an image pasted into the request text and sends it with the request', async () => {
    const view = await renderDialog();
    await fillIn(view);
    fireEvent.paste(screen.getByRole('textbox', { name: 'Request text' }), { clipboardData: { files: [png('checkout.png', 'pixels')] } });
    const previews = await screen.findByRole('list', { name: 'Attached screenshots' });
    expect(within(previews).getByRole('img', { name: 'checkout.png' })).toHaveAttribute('src', `data:image/png;base64,${base64Of('pixels')}`);
    expect(screen.getByText('1 of 6 attached')).toBeInTheDocument();
    await view.user.click(screen.getByRole('button', { name: 'Save the request' }));
    await expectCommand(view.transport, 'request.create', {
      project: 'storefront',
      title: TITLE,
      requester: 'Alex Morgan',
      body: BODY,
      attachments: [{ name: 'checkout.png', mediaType: 'image/png', dataUrl: `data:image/png;base64,${base64Of('pixels')}` }],
    });
  });

  it('keeps pasting text as text', async () => {
    const view = await renderDialog();
    const text = screen.getByRole('textbox', { name: 'Request text' });
    await view.user.click(text);
    await view.user.paste(BODY);
    expect(text).toHaveValue(BODY);
    expect(screen.queryByRole('list', { name: 'Attached screenshots' })).not.toBeInTheDocument();
  });

  it('attaches the images dropped on the drop zone and says which files were not images', async () => {
    const view = await renderDialog();
    const dropZone = screen.getByRole('group', { name: 'Attach screenshots' });
    fireEvent.drop(dropZone, { dataTransfer: { files: [png('cart.png'), new File(['notes'], 'notes.txt', { type: 'text/plain' })] } });
    const previews = await screen.findByRole('list', { name: 'Attached screenshots' });
    expect(within(previews).getAllByRole('img').map((preview) => preview.getAttribute('alt'))).toEqual(['cart.png']);
    expect(dialogAlert()).toHaveTextContent('Only images can be attached; the other files were ignored.');
    expect(view.transport.commands).toEqual([]);
  });

  it('marks the drop zone while a file is dragged over it', async () => {
    await renderDialog();
    const dropZone = screen.getByRole('group', { name: 'Attach screenshots' });
    fireEvent.dragOver(dropZone);
    expect(dropZone).toHaveClass('is-dragging');
    fireEvent.dragLeave(dropZone);
    expect(dropZone).not.toHaveClass('is-dragging');
  });

  it('attaches the images chosen with the browse control', async () => {
    const view = await renderDialog();
    const chooser = screen.getByLabelText('browse your files');
    await view.user.upload(chooser, [png('first.png'), png('second.png')]);
    const previews = await screen.findByRole('list', { name: 'Attached screenshots' });
    await waitFor(() => expect(within(previews).getAllByRole('img').map((preview) => preview.getAttribute('alt'))).toEqual(['first.png', 'second.png']));
    expect(screen.getByText('2 of 6 attached')).toBeInTheDocument();
  });

  it(`keeps at most ${MAX_ATTACHMENTS} images and says that the others were ignored`, async () => {
    const view = await renderDialog();
    const files = Array.from({ length: MAX_ATTACHMENTS + 1 }, (_, index) => png(`shot-${index}.png`));
    await view.user.upload(screen.getByLabelText('browse your files'), files);
    const previews = await screen.findByRole('list', { name: 'Attached screenshots' });
    await waitFor(() => expect(within(previews).getAllByRole('img')).toHaveLength(MAX_ATTACHMENTS));
    expect(dialogAlert()).toHaveTextContent(`At most ${MAX_ATTACHMENTS} images can be attached; the others were ignored.`);
  });

  it('removes an attached image before the request is sent', async () => {
    const view = await renderDialog();
    await fillIn(view);
    await view.user.upload(screen.getByLabelText('browse your files'), [png('first.png'), png('second.png')]);
    await screen.findByRole('img', { name: 'second.png' });
    await view.user.click(screen.getByRole('button', { name: 'Remove first.png' }));
    expect(screen.queryByRole('img', { name: 'first.png' })).not.toBeInTheDocument();
    await view.user.click(screen.getByRole('button', { name: 'Save the request' }));
    await expectCommand(view.transport, 'request.create', {
      project: 'storefront',
      title: TITLE,
      requester: 'Alex Morgan',
      body: BODY,
      attachments: [{ name: 'second.png', mediaType: 'image/png', dataUrl: `data:image/png;base64,${base64Of('second.png')}` }],
    });
  });

  it('empties the form once the factory has accepted the request', async () => {
    const view = await renderDialog();
    await fillIn(view);
    await view.user.upload(screen.getByLabelText('browse your files'), [png('first.png')]);
    await screen.findByRole('img', { name: 'first.png' });
    await view.user.click(screen.getByRole('button', { name: 'Save the request' }));
    await expectCommand(view.transport, 'request.create', expect.anything());
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue(''));
    expect(screen.getByRole('textbox', { name: 'Request text' })).toHaveValue('');
    expect(screen.queryByRole('img', { name: 'first.png' })).not.toBeInTheDocument();
  });

  it('is written in French when the language is French', async () => {
    await renderDialog({ locale: 'fr' });
    expect(screen.getByRole('dialog', { name: 'Nouvelle demande' })).toBeInTheDocument();
    expect(screen.getByLabelText('parcourez vos fichiers')).toBeInTheDocument();
    fireEvent.drop(screen.getByRole('group', { name: 'Joindre des captures' }), { dataTransfer: { files: [png('panier.png'), new File(['x'], 'liste.txt', { type: 'text/plain' })] } });
    await screen.findByRole('img', { name: 'panier.png' });
    expect(dialogAlert()).toHaveTextContent('Seules les images peuvent être jointes');
    expect(screen.getByText('1 sur 6 jointes')).toBeInTheDocument();
  });
});
