import type { TwinOf } from '../types.ts';
import type { enCommands } from '../en/commands.ts';

export const frCommands = {} as const satisfies TwinOf<typeof enCommands>;
