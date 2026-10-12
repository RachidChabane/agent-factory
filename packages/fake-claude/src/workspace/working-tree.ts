export interface WriteReceipt {
  readonly created: boolean;
  readonly previousContent: string | null;
}

export interface WorkingTree {
  absolute(relativePath: string): string;
  write(absolutePath: string, content: string): Promise<WriteReceipt>;
  remove(absolutePath: string): Promise<void>;
}
