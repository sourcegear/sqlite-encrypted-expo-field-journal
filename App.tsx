import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import {
  addEntry,
  deleteEntry,
  initializeJournal,
  listEntries,
  rotateDatabaseKey,
  type JournalEntry,
} from './src/database';

type NativeError = Error & {
  code?: unknown;
  cause?: unknown;
};

function describeError(value: unknown): string {
  if (!(value instanceof Error)) {
    return String(value);
  }

  const error = value as NativeError;
  const details = [error.message];
  if (error.code !== undefined && !error.message.includes(String(error.code))) {
    details.push(`Code: ${String(error.code)}`);
  }
  if (error.cause !== undefined) {
    details.push(
      `Cause: ${error.cause instanceof Error ? error.cause.message : String(error.cause)}`
    );
  }
  return details.join('\n');
}

function reportError(context: string, value: unknown): string {
  // React Native prints the complete native exception and JavaScript stack to
  // Metro and logcat. Keep the shorter, actionable details visible in the app.
  console.error(`[Encrypted Field Journal] ${context}`, value);
  return describeError(value);
}

export default function App() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [search, setSearch] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async (term = search) => {
    setEntries(await listEntries(term));
  }, [search]);

  useEffect(() => {
    let active = true;
    initializeJournal()
      .then(() => listEntries())
      .then((loaded) => {
        if (active) {
          setEntries(loaded);
          setReady(true);
        }
      })
      .catch((value: unknown) => {
        if (active) {
          setError(reportError('Unable to open the encrypted journal.', value));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function saveEntry() {
    setBusy(true);
    setError(undefined);
    try {
      await addEntry(title, body);
      setTitle('');
      setBody('');
      setSearch('');
      await refresh('');
    } catch (value) {
      setError(reportError('Unable to save the journal entry.', value));
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(id: number) {
    setBusy(true);
    setError(undefined);
    try {
      await deleteEntry(id);
      await refresh();
    } catch (value) {
      setError(reportError('Unable to delete the journal entry.', value));
    } finally {
      setBusy(false);
    }
  }

  function confirmKeyRotation() {
    Alert.alert(
      'Rotate database key?',
      'The journal will remain open while SEE replaces its encryption key.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rotate key',
          onPress: () => {
            setBusy(true);
            setError(undefined);
            rotateDatabaseKey()
              .then(() => Alert.alert('Key rotated', 'The journal data is still available.'))
              .catch((value: unknown) => {
                setError(reportError('Unable to rotate the database key.', value));
              })
              .finally(() => setBusy(false));
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>SQLITE.ENCRYPTED + OFFICIAL SQLITE SEE</Text>
          <Text style={styles.heading}>Encrypted Field Journal</Text>
          <Text style={styles.introduction}>
            Notes stay in an encrypted SQLite database on this device. The ordinary Expo
            SQLite query API remains unchanged.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!ready && !error ? (
            <View style={styles.loading}>
              <ActivityIndicator color="#1f6f5c" />
              <Text style={styles.muted}>Opening the encrypted journal…</Text>
            </View>
          ) : null}

          {ready ? (
            <>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>New entry</Text>
                <TextInput
                  accessibilityLabel="Entry title"
                  onChangeText={setTitle}
                  placeholder="Title"
                  style={styles.input}
                  value={title}
                />
                <TextInput
                  accessibilityLabel="Journal text"
                  multiline
                  onChangeText={setBody}
                  placeholder="What happened today?"
                  style={[styles.input, styles.bodyInput]}
                  textAlignVertical="top"
                  value={body}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={saveEntry}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    (pressed || busy) && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>Save encrypted entry</Text>
                </Pressable>
              </View>

              <View style={styles.searchRow}>
                <TextInput
                  accessibilityLabel="Search journal"
                  onChangeText={setSearch}
                  onSubmitEditing={() => refresh()}
                  placeholder="Search encrypted entries"
                  returnKeyType="search"
                  style={[styles.input, styles.searchInput]}
                  value={search}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => refresh()}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>Search</Text>
                </Pressable>
              </View>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Journal entries</Text>
                <Text style={styles.count}>{entries.length}</Text>
              </View>
              {entries.length === 0 ? (
                <Text style={styles.empty}>No matching entries yet.</Text>
              ) : (
                entries.map((entry) => (
                  <View key={entry.id} style={styles.entry}>
                    <Text style={styles.entryTitle}>{entry.title}</Text>
                    <Text style={styles.entryDate}>
                      {new Date(entry.createdAt).toLocaleString()}
                    </Text>
                    <Text style={styles.entryBody}>{entry.body}</Text>
                    <Pressable
                      accessibilityLabel={`Delete ${entry.title}`}
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => removeEntry(entry.id)}
                    >
                      <Text style={styles.deleteText}>Delete entry</Text>
                    </Pressable>
                  </View>
                ))
              )}

              <View style={styles.securityCard}>
                <Text style={styles.sectionTitle}>Encryption maintenance</Text>
                <Text style={styles.muted}>
                  Generate a fresh key, re-encrypt the open database with SEE, and replace
                  the copy held by the device secure store.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={confirmKeyRotation}
                  style={styles.outlineButton}
                >
                  <Text style={styles.outlineButtonText}>Rotate database key</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#f4f1e8' },
  content: { padding: 22, paddingBottom: 48 },
  eyebrow: {
    color: '#1f6f5c',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  heading: { color: '#18352f', fontSize: 34, fontWeight: '800', lineHeight: 39 },
  introduction: { color: '#42534f', fontSize: 16, lineHeight: 23, marginTop: 10 },
  card: {
    backgroundColor: '#fffdf7',
    borderColor: '#d9d2c2',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 24,
    padding: 16,
  },
  sectionTitle: { color: '#18352f', fontSize: 19, fontWeight: '700' },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#bfc8c3',
    borderRadius: 9,
    borderWidth: 1,
    color: '#18211f',
    fontSize: 16,
    marginTop: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  bodyInput: { minHeight: 116 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1f6f5c',
    borderRadius: 9,
    marginTop: 14,
    padding: 13,
  },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  buttonPressed: { opacity: 0.58 },
  searchRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 9, marginTop: 12 },
  searchInput: { flex: 1 },
  secondaryButton: {
    backgroundColor: '#d9e8e2',
    borderRadius: 9,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  secondaryButtonText: { color: '#164c40', fontWeight: '700' },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 28,
  },
  count: {
    backgroundColor: '#d9e8e2',
    borderRadius: 20,
    color: '#164c40',
    fontWeight: '800',
    minWidth: 28,
    paddingHorizontal: 9,
    paddingVertical: 4,
    textAlign: 'center',
  },
  entry: {
    backgroundColor: '#fffdf7',
    borderColor: '#d9d2c2',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    padding: 15,
  },
  entryTitle: { color: '#18352f', fontSize: 18, fontWeight: '700' },
  entryDate: { color: '#6d7874', fontSize: 12, marginTop: 3 },
  entryBody: { color: '#273632', fontSize: 15, lineHeight: 22, marginTop: 10 },
  deleteText: { color: '#a13c35', fontWeight: '700', marginTop: 13 },
  securityCard: {
    backgroundColor: '#e8efe9',
    borderRadius: 14,
    marginTop: 28,
    padding: 16,
  },
  outlineButton: {
    alignItems: 'center',
    borderColor: '#1f6f5c',
    borderRadius: 9,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  outlineButtonText: { color: '#164c40', fontWeight: '700' },
  muted: { color: '#52615d', lineHeight: 20 },
  loading: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 24 },
  error: {
    backgroundColor: '#f9e4df',
    borderRadius: 10,
    color: '#8c2f28',
    lineHeight: 20,
    marginTop: 20,
    padding: 13,
  },
  empty: { color: '#6d7874', fontStyle: 'italic', marginTop: 14 },
});
