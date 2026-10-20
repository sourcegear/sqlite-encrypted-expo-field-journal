import { Platform } from 'react-native';
import * as SQLite from '@sqlite-encrypted/expo';

import {
  generateDatabaseKey,
  getOrCreateDatabaseKey,
  storeDatabaseKey,
} from './databaseKey';

const DATABASE_NAME = 'field-journal.db';
const SCHEMA_VERSION = 1;
const ACTIVATION_PROBE_KEY = 'sqlite-encrypted-activation-probe';

export type JournalEntry = {
  id: number;
  title: string;
  body: string;
  createdAt: string;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

async function closeQuietly(
  database: SQLite.SQLiteDatabase | undefined
): Promise<void> {
  if (!database) {
    return;
  }
  try {
    await database.closeAsync();
  } catch {
    // A connection opened with the wrong key may already be invalid.
  }
}

function requireActivationKey(): string {
  const variableName = 'EXPO_PUBLIC_SQLITE_ENCRYPTED_ACTIVATION_KEY';
  const configuredValue = process.env.EXPO_PUBLIC_SQLITE_ENCRYPTED_ACTIVATION_KEY;
  const value = configuredValue?.trim();

  if (!value || value === 'replace-with-your-see-activation-key') {
    throw new Error(
      `Missing SEE activation key. Set ${variableName} in .env, then completely restart Metro and the development client.`
    );
  }
  if (value.startsWith('see-')) {
    throw new Error(
      `${variableName} must contain the activation key without the "see-" prefix. The prefix is used only with the PRAGMA form.`
    );
  }
  return value;
}

async function verifySEEActivation(): Promise<void> {
  let probe: SQLite.SQLiteDatabase | undefined;
  try {
    probe = await SQLite.openDatabaseAsync(':memory:', {
      key: ACTIVATION_PROBE_KEY,
      useNewConnection: true,
    });
  } catch (cause) {
    const error = new Error(
      'SEE activation failed. Verify that EXPO_PUBLIC_SQLITE_ENCRYPTED_ACTIVATION_KEY is valid for this SQLite version and platform, then completely restart the application.'
    ) as Error & { cause?: unknown };
    error.cause = cause;
    throw error;
  } finally {
    await closeQuietly(probe);
  }
}

async function migrate(database: SQLite.SQLiteDatabase): Promise<void> {
  const version = await database.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const currentVersion = version?.user_version ?? 0;

  if (currentVersion > SCHEMA_VERSION) {
    throw new Error(
      `Database schema ${currentVersion} is newer than this app supports (${SCHEMA_VERSION}).`
    );
  }

  if (currentVersion === 0) {
    await database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.execAsync(`
        CREATE TABLE journal_entries (
          id INTEGER PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        PRAGMA user_version = ${SCHEMA_VERSION};
      `);
    });
  }
}

async function openWithKey(key: string): Promise<SQLite.SQLiteDatabase> {
  let database: SQLite.SQLiteDatabase | undefined;
  try {
    database = await SQLite.openDatabaseAsync(DATABASE_NAME, { key });
    // Force a schema read. Some SQLite wrappers do not surface an invalid key
    // until the first statement is prepared.
    await database.getFirstAsync('SELECT count(*) FROM sqlite_master');
    return database;
  } catch (error) {
    await closeQuietly(database);
    throw error;
  }
}

async function openJournal(): Promise<SQLite.SQLiteDatabase> {
  if (Platform.OS === 'web') {
    throw new Error(
      'This example requires an Android or iOS development build. Expo web is not SEE-backed.'
    );
  }

  // Validate configuration before generating or loading the database key and
  // before attempting to construct a native database connection.
  SQLite.activateSEE(requireActivationKey());
  await verifySEEActivation();
  const key = await getOrCreateDatabaseKey();
  const database = await openWithKey(key);
  await database.execAsync('PRAGMA journal_mode = WAL');
  await migrate(database);
  return database;
}

export function initializeJournal(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= openJournal().catch((error) => {
    databasePromise = undefined;
    throw error;
  });
  return databasePromise;
}

export async function listEntries(search = ''): Promise<JournalEntry[]> {
  const database = await initializeJournal();
  const term = search.trim();
  if (!term) {
    return database.getAllAsync<JournalEntry>(`
      SELECT id, title, body, created_at AS createdAt
      FROM journal_entries
      ORDER BY created_at DESC, id DESC
    `);
  }

  const pattern = `%${term}%`;
  return database.getAllAsync<JournalEntry>(
    `
      SELECT id, title, body, created_at AS createdAt
      FROM journal_entries
      WHERE title LIKE ? OR body LIKE ?
      ORDER BY created_at DESC, id DESC
    `,
    pattern,
    pattern
  );
}

export async function addEntry(title: string, body: string): Promise<JournalEntry> {
  const cleanTitle = title.trim();
  const cleanBody = body.trim();
  if (!cleanTitle || !cleanBody) {
    throw new Error('Enter both a title and journal text.');
  }

  const database = await initializeJournal();
  const createdAt = new Date().toISOString();
  const result = await database.runAsync(
    'INSERT INTO journal_entries (title, body, created_at) VALUES (?, ?, ?)',
    cleanTitle,
    cleanBody,
    createdAt
  );
  const entry = await database.getFirstAsync<JournalEntry>(
    `
      SELECT id, title, body, created_at AS createdAt
      FROM journal_entries
      WHERE id = ?
    `,
    result.lastInsertRowId
  );
  if (!entry) {
    throw new Error('The journal entry was saved but could not be reloaded.');
  }
  return entry;
}

export async function deleteEntry(id: number): Promise<void> {
  const database = await initializeJournal();
  await database.runAsync('DELETE FROM journal_entries WHERE id = ?', id);
}

export async function rotateDatabaseKey(): Promise<void> {
  const database = await initializeJournal();
  const newKey = await generateDatabaseKey();
  await database.rekeyAsync(null, newKey);
  await storeDatabaseKey(newKey);
}
