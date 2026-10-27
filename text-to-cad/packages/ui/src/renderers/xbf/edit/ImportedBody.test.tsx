import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import ImportedBody from '../../../../dist/renderers/xbf/edit/ImportedBody.js';

afterEach(cleanup);

it("makes a STEP brought in a part and opens it, or opens the part made of it before", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();
  const onAdopt = vi.fn(async () => ({ part: '/p/pico_part.step' }));
  const { rerender } = render(<ImportedBody imported={{ part: null }} onAdopt={onAdopt} onOpen={onOpen} />);
  await user.click(screen.getByRole('button', { name: 'Edit as a part' }));
  await waitFor(() => expect(onOpen).toHaveBeenCalledWith('/p/pico_part.step'));
  // Made before: it opens that part, and makes no other.
  rerender(<ImportedBody imported={{ part: '/p/pico_part.step' }} onAdopt={onAdopt} onOpen={onOpen} />);
  await user.click(screen.getByRole('button', { name: 'Open its part' }));
  expect(onAdopt).toHaveBeenCalledTimes(1);
  expect(onOpen).toHaveBeenCalledTimes(2);
});

it("says so when the part could not be made, and opens nothing", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();
  render(<ImportedBody imported={{ part: null }} onAdopt={async () => null} onOpen={onOpen} />);
  await user.click(screen.getByRole('button', { name: 'Edit as a part' }));
  await waitFor(() => expect(screen.getByText(/couldn't make it a part/)).toBeTruthy());
  expect(onOpen).not.toHaveBeenCalled();
});
