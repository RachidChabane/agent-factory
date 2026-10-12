export interface CliOutput {
  line(text: string): void;
  error(text: string): void;
}

export const processOutput: CliOutput = {
  line: (text) => {
    process.stdout.write(`${text}\n`);
  },
  error: (text) => {
    process.stderr.write(`${text}\n`);
  },
};

export const EXIT_CODES = {
  ok: 0,
  failure: 1,
  usage: 2,
  needsHuman: 3,
  blocked: 4,
  confirmationRequired: 5,
} as const;
