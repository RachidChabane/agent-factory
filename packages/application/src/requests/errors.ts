export class RequestNotFoundError extends Error {
  constructor(requestId: string) {
    super(`request ${requestId} does not exist`);
    this.name = 'RequestNotFoundError';
  }
}

export class RequestChallengeRefusedError extends Error {
  constructor(requestId: string, state: string) {
    super(`request ${requestId} is ${state} and cannot be challenged`);
    this.name = 'RequestChallengeRefusedError';
  }
}

export class InvalidRequestImageNameError extends Error {
  constructor(name: string) {
    super(`"${name}" is not a plain image file name`);
    this.name = 'InvalidRequestImageNameError';
  }
}

export class RequestImageMissingError extends Error {
  constructor(name: string, sourceDirectory: string) {
    super(`image "${name}" does not exist in ${sourceDirectory}`);
    this.name = 'RequestImageMissingError';
  }
}
