import { Database } from "tjs:sqlite";
import { cleanupStaged, closeStaged, openStaged, selectStaged, stageAnkiFile } from "./anki";
import { queryAll, runStatement } from "./sql";

const IS_WIN = tjs.env.OS === "Windows_NT";
const IS_LINUX = !IS_WIN && /linux/i.test(globalThis.navigator?.platform ?? "");

let db: Database | null = null;
let dataDir: string | null = null;
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
async function migrateLegacyLinuxData(dir: string): Promise<void> {
  if (!IS_LINUX) return;
  const legacyDir = (tjs.env.XDG_CONFIG_HOME || tjs.homeDir + "/.config") + "/com.revision.app";
  if ((await exists(dir + "/revision.db")) || !(await exists(legacyDir + "/revision.db"))) return;
  await tjs.makeDir(dir, { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    const from = legacyDir + "/revision.db" + suffix;
    if (await exists(from)) await tjs.writeFile(dir + "/revision.db" + suffix, await tjs.readFile(from));
  }
  console.log("[backend] migrated legacy revision.db from " + legacyDir);
}

function bootstrap(app: TinyApp): Promise<void> {
  return (async () => {
    const dir = app.paths.data;
    await tjs.makeDir(dir, { recursive: true });
    await migrateLegacyLinuxData(dir);
    db = new Database(dir + "/revision.db");
    dataDir = dir;
    console.log("[backend] sqlite open: " + dir + "/revision.db");
  })();
}

async function ensureReady(): Promise<void> {
  if (!ready) throw new Error("backend is not initialized");
  await ready;
  if (!db || !dataDir) throw new Error("database is not open");
}

function dbHandle(): Database {
  return db!;
}

function dataDirPath(): string {
  return dataDir!;
}

export const api: Record<string, TinyApiHandler> = {
  log: ({ msg }: { msg: string }) => {
    console.log("[page]", String(msg));
    return true;
  },
  ping: () => "pong",
  "db.select": async ({ sql, params }: { sql: string; params?: unknown[] }) => {
    await ensureReady();
    return queryAll(dbHandle(), sql, params ?? []);
  },
  "db.execute": async ({ sql, params }: { sql: string; params?: unknown[] }) => {
    await ensureReady();
    runStatement(dbHandle(), sql, params ?? []);
    const meta = queryAll(dbHandle(), "SELECT last_insert_rowid() AS id, changes() AS n", []);
    return {
      lastInsertId: (meta[0]?.id as number | undefined) ?? null,
      rowsAffected: (meta[0]?.n as number | undefined) ?? 0,
    };
  },
  "fs.exists": ({ path }: { path: string }) => exists(path),
  "fs.readText": async ({ path }: { path: string }) => {
    const data = await tjs.readFile(path);
    return new TextDecoder().decode(data);
  },
  "fs.writeText": async ({ path, text }: { path: string; text: string }) => {
    await tjs.writeFile(path, new TextEncoder().encode(text));
  },
  "anki.stage": async ({ path }: { path: string }) => {
    await ensureReady();
    return stageAnkiFile(path, dataDirPath());
  },
  "anki.open": async ({ rel }: { rel: string }) => {
    await ensureReady();
    openStaged(dataDirPath(), rel);
    return true;
  },
  "anki.select": async ({ sql, params }: { sql: string; params?: unknown[] }) => {
    await ensureReady();
    return selectStaged(sql, params ?? []);
  },
  "anki.close": () => {
    closeStaged();
    return true;
  },
  "anki.cleanup": async () => {
    await ensureReady();
    await cleanupStaged(dataDirPath());
    return true;
  },
};

export function init(app: TinyApp) {
  ready = bootstrap(app);
  console.log("[backend] revision backend up");
}
