import type { z } from 'zod';
import type { CommandAccepted, CommandBody, CommandName } from '../contract/index.ts';
import { COMMAND_BODY_SCHEMAS, CommandAcceptedSchema } from '../contract/index.ts';
import { describeZodError } from './parse.ts';
import type { CockpitTransport } from './transport.ts';

export class CommandError extends Error {
  readonly command: CommandName;

  constructor(command: CommandName, message: string) {
    super(message);
    this.name = 'CommandError';
    this.command = command;
  }
}

export interface CommandSender {
  send<N extends CommandName>(name: N, body: CommandBody<N>): Promise<CommandAccepted>;
}

/** Validates a command against its schema, posts it, and reports what the factory did about it. */
export class CommandClient implements CommandSender {
  private readonly transport: CockpitTransport;
  private readonly onAccepted: (accepted: CommandAccepted) => void;

  constructor(transport: CockpitTransport, onAccepted: (accepted: CommandAccepted) => void) {
    this.transport = transport;
    this.onAccepted = onAccepted;
  }

  async send<N extends CommandName>(name: N, body: CommandBody<N>): Promise<CommandAccepted> {
    const schema: z.ZodType = COMMAND_BODY_SCHEMAS[name];
    const validated = schema.safeParse(body);
    if (!validated.success) throw new CommandError(name, describeZodError(validated.error));
    let response: unknown;
    try {
      response = await this.transport.sendCommand(name, validated.data);
    } catch (error) {
      throw new CommandError(name, error instanceof Error ? error.message : String(error));
    }
    const accepted = CommandAcceptedSchema.safeParse(response);
    if (!accepted.success) throw new CommandError(name, describeZodError(accepted.error));
    this.onAccepted(accepted.data);
    return accepted.data;
  }
}
