import { desktopCall } from "../platform";

export type ExecuteResult = { lastInsertId: number | null; rowsAffected: number };

/** Drop-in for the Tauri sql plugin's Database, backed by the tinyjs bridge. */
export class TinyjsDatabase {
  async select<T>(sql: string, params?: unknown[]): Promise<T> {
    return desktopCall<T>("db.select", { sql, params: params ?? [] });
  }

  async execute(sql: string, params?: unknown[]): Promise<ExecuteResult> {
    return desktopCall<ExecuteResult>("db.execute", { sql, params: params ?? [] });
  }
}

export async function loadTinyjsDatabase(): Promise<TinyjsDatabase> {
  return new TinyjsDatabase();
}
