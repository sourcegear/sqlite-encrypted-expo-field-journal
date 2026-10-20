import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const DATABASE_KEY_NAME = 'sqlite-encrypted-field-journal.database-key';

export async function generateDatabaseKey(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function getOrCreateDatabaseKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DATABASE_KEY_NAME);
  if (existing) {
    return existing;
  }

  const generated = await generateDatabaseKey();
  await storeDatabaseKey(generated);
  return generated;
}

export async function storeDatabaseKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(DATABASE_KEY_NAME, key);
}
