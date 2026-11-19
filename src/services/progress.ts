import { openDatabaseAsync } from 'expo-sqlite';

const database = openDatabaseAsync('photo-swipe.db').then(async db => {
  await db.execAsync('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS kept (id TEXT PRIMARY KEY NOT NULL); CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);');
  return db;
});

export async function getKept(): Promise<Set<string>> {
  const rows = await (await database).getAllAsync<{ id: string }>('SELECT id FROM kept');
  return new Set(rows.map(row => row.id));
}

export async function keepPhoto(id: string) {
  await (await database).runAsync('INSERT OR IGNORE INTO kept (id) VALUES (?)', id);
}

export async function hasOnboarded() {
  return !!await (await database).getFirstAsync("SELECT key FROM preferences WHERE key = 'onboarded'");
}

export async function finishOnboarding() {
  await (await database).runAsync("INSERT OR REPLACE INTO preferences (key, value) VALUES ('onboarded', '1')");
}
