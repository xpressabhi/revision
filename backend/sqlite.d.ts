declare module "tjs:sqlite" {
  export class Database {
    constructor(path: string);
    prepare(sql: string): Statement;
    close(): void;
  }

  export interface Statement {
    run(...args: unknown[]): void;
    all(...args: unknown[]): Record<string, unknown>[];
    finalize(): void;
  }
}
