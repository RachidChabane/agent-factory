/** How often the run looks at what it waits for. */
export const POLL_INTERVAL_MS = 1_000;
/** How long the forge may take to record the checks of the pull request's head. */
export const GATE_CHECKS_TIMEOUT_MS = 120_000;
/** How long a started factory may take to answer its first request. */
export const FACTORY_READY_TIMEOUT_MS = 60_000;
/** How long a factory asked to stop may take to end before it is ended for good. */
export const FACTORY_STOP_TIMEOUT_MS = 30_000;
/** The longest a factory started for the run may live, whatever happens to the run. */
export const FACTORY_LIFETIME_LIMIT_MS = 600_000;
/** The longest any other factory command may take. */
export const COMMAND_TIMEOUT_MS = 300_000;
/** The longest the cockpit may take to answer one request for its state. */
export const STATE_REQUEST_TIMEOUT_MS = 10_000;
