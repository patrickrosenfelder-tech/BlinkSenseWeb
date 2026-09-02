import { openDB } from 'idb';

const DB_NAME = 'blinksense';
const DB_VERSION = 1;
const STORE = 'sessions';

function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      store.createIndex('startedAt', 'startedAt');
    },
  });
}

/** session: { startedAt, durationMs, category, avgBpm, blinkCount, alertCount, zoneStats } */
export async function saveSession(session) {
  const db = await getDb();
  await db.add(STORE, session);
}

/** Most recent session first. */
export async function getAllSessions() {
  const db = await getDb();
  const all = await db.getAllFromIndex(STORE, 'startedAt');
  return all.reverse();
}

export async function clearSessions() {
  const db = await getDb();
  await db.clear(STORE);
}
