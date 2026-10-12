import { openCockpit, sidebar } from '../../support/cockpit.ts';
import { STOREFRONT } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';

const STOP_LABEL = 'Stop after running work';
const DEMONSTRATION_REASON = 'Not available in the demonstration, which has no factory process to stop.';

test.describe('stopping the factory of the demonstration', () => {
  test('offers no way to stop the factory from the cockpit and says why', async ({ page, factory }) => {
    await openCockpit(page, factory, '/');
    const stop = sidebar(page).getByRole('button', { name: new RegExp(`^${STOP_LABEL}`) });
    await expect(stop).toBeDisabled();
    await expect(stop).toHaveAccessibleName(`${STOP_LABEL} (${DEMONSTRATION_REASON})`);
    await openCockpit(page, factory, `/projects/${STOREFRONT}`);
    const whole = page.getByRole('region', { name: 'Whole installation' });
    await expect(whole.getByRole('button', { name: STOP_LABEL })).toBeDisabled();
    await expect(whole.getByRole('button', { name: STOP_LABEL })).toHaveAccessibleDescription(DEMONSTRATION_REASON);
    await expect(whole.getByText(DEMONSTRATION_REASON)).toBeVisible();
  });

  test('does not offer to stop the factory in the command palette either', async ({ page, factory }) => {
    await openCockpit(page, factory, '/');
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await palette.getByRole('combobox').fill(STOP_LABEL);
    await expect(palette.getByRole('option')).toHaveCount(0);
  });
});
