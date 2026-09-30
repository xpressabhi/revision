import { Database } from "tjs:sqlite";
import { normalizeParams, translatePlaceholders } from "./sql";

const IS_WIN = tjs.env.OS === "Windows_NT";
const IS_LINUX = !IS_WIN && /linux/i.test(globalThis.navigator?.platform ?? "");

let db: Database | null = null;
let ready: Promise<void> | null = null;

async function exists(path: string): Promise<boolean> {
  try {
    await tjs.stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Linux only: Tauri kept app data in $XDG_CONFIG_HOME/com.revision.app,
 * tinyjs uses $XDG_DATA_HOME/com.revision.app. Copy the database across once,
 * before the first open. macOS/Windows already share the Tauri directory.
 */
async function migrateLegacyLinuxData(dataDir: string): Promise<void> {
  if (!IS_LINUX) return;
  const legacyDir = (tjs.env.XDG_CONFIG_HOME || tjs.homeDir + "/.config") + "/com.revision.app";
  if ((await exists(dataDir + "/revision.db")) || !(await exists(legacyDir + "/revision.db"))) return;
  await tjs.makeDir(dataDir, { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    const from = legacyDir + "/revision.db" + suffix;
    if (await exists(from)) await tjs.writeFile(dataDir + "/revision.db" + suffix, await tjs.readFile(from));
  }
  console.log("[backend] migrated legacy revision.db from " + legacyDir);
}

function bootstrap(app: TinyApp): Promise<void> {
  return (async () => {
    const dir = app.paths.data;
    await tjs.makeDir(dir, { recursive: true });
    await migrateLegacyLinuxData(dir);
    db = new Database(dir + "/revision.db");
    console.log("[backend] sqlite open: " + dir + "/revision.db");
  })();
}

async function ensureReady(): Promise<void> {
  if (!ready) throw new Error("backend is not initialized");
  await ready;
  if (!db) throw new Error("database is not open");
}

function queryAll(sql: string, params: unknown[]): Record<string, unknown>[] {
  const stmt = db!.prepare(translatePlaceholders(sql));
  try {
    return stmt.all(...normalizeParams(params));
  } finally {
    stmt.finalize();
  }
}

export const api: Record<string, TinyApiHandler> = {
  log: ({ msg }: { msg: string }) => {
    console.log("[page]", String(msg));
    return true;
  },
  ping: () => "pong",
  "db.select": async ({ sql, params }: { sql: string; params?: unknown[] }) => {
    await ensureReady();
    return queryAll(sql, params ?? []);
  },
  "db.execute": async ({ sql, params }: { sql: string; params?: unknown[] }) => {
    await ensureReady();
    const stmt = db!.prepare(translatePlaceholders(sql));
    try {
      stmt.run(...normalizeParams(params ?? []));
    } finally {
      stmt.finalize();
    }
    const meta = queryAll("SELECT last_insert_rowid() AS id, changes() AS n", []);
    return {
      lastInsertId: (meta[0]?.id as number | undefined) ?? null,
      rowsAffected: (meta[0]?.n as number | undefined) ?? 0,
    };
  },
};

export function init(app: TinyApp) {
  ready = bootstrap(app);
  console.log("[backend] revision backend up");
}
