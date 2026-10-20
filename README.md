# Encrypted Expo Field Journal with SQLite SEE

This runnable Expo application demonstrates local encrypted SQLite storage
using `@sqlite-encrypted/expo` and the official SQLite Encryption Extension
(SEE). It uses the normal Expo SQLite query API while SQLite.Encrypted supplies
the SEE-backed Android and iOS native libraries.

This example uses SQLite SEE. It does not use SQLCipher.

## What the application demonstrates

- Activating SEE once before opening an encrypted database.
- Supplying the database key through `openDatabaseAsync`.
- Creating and migrating an encrypted SQLite schema.
- Inserting, searching, listing, and deleting journal entries.
- Generating the database key with `expo-crypto`.
- Keeping the database key in `expo-secure-store`.
- Rotating the database key with `rekeyAsync`.
- Using an Expo development build with a custom native SQLite module.

## Prerequisites

- Node.js 20 or newer.
- An Android or iOS development environment supported by Expo.
- A licensed SEE activation key.

Free fully-featured demo keys are available from
[sqlite.sourcegear.com](https://sqlite.sourcegear.com/#evaluation).

The standard Expo Go client cannot run this application because Expo Go does
not contain the SQLite.Encrypted native module. Build a custom development
client as shown below.

## Install and run

This sample includes an `.npmrc` that directs the `@sqlite-encrypted` scope to
the SQLite.Encrypted package repository:

```ini
@sqlite-encrypted:registry=https://packages.sourcegear.com/npm/
```

Its `package.json` pins the published Expo package version:

```json
"@sqlite-encrypted/expo": "3.54.0"
```

Install the dependencies before running any Expo command:

```shell
npm install
```

The npm scripts invoke the Expo CLI installed in this project. If an error says
that the legacy global `expo-cli` is running, the local dependencies have not
been installed successfully.

Create the local environment file.

```shell
cp .env.example .env
```

On PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Replace the placeholder in `.env` with the activation key issued with your SEE
license. Supply the hexadecimal activation key without the `see-` prefix; that
prefix is used only by the SQL `PRAGMA activate_extensions` form.

```dotenv
EXPO_PUBLIC_SQLITE_ENCRYPTED_ACTIVATION_KEY=your-see-activation-key
```

If the variable is missing, blank, or still contains the placeholder, the
application stops before creating a database connection and displays a clear
configuration error. Completely restart Metro and the development client after
changing the value because SEE activation is process-global.

After calling `activateSEE`, the sample applies an encryption key to a temporary
in-memory database. If SEE rejects the activation key, the application reports
an activation-specific error before attempting to open the journal database.

Build and run the native application:

```shell
npm run android
```

or, on macOS:

```shell
npm run ios
```

After the first native build, start Metro for the installed development client
with:

```shell
npm start
```

Rebuild the native application after changing native dependencies, Expo
plugins, or native configuration. Ordinary TypeScript and UI changes can be
reloaded through Metro without another native build.

## Encryption flow

The important initialization code is in `src/database.ts`:

```typescript
SQLite.activateSEE(activationKey);

const database = await SQLite.openDatabaseAsync('field-journal.db', {
  key: databaseKey,
});
```

The application then uses ordinary Expo SQLite calls such as `execAsync`,
`runAsync`, `getFirstAsync`, and `getAllAsync`. Key rotation uses the
connection-level SEE API:

```typescript
await database.rekeyAsync(null, replacementKey);
```

## Key handling

The sample generates a random 256-bit database key and stores its hexadecimal
representation with `expo-secure-store`. The database key is not committed to
source control or placed in the Expo public environment.

The activation key is supplied through an `EXPO_PUBLIC_` variable to keep this
example easy to run. Expo embeds public environment variables in the
application bundle, so this mechanism is configuration, not secret storage.
Choose an activation-key delivery and application-protection strategy that is
appropriate for your SEE license and production threat model.

Key rotation calls `rekeyAsync` on the open database and then replaces the key
stored in `expo-secure-store`. A production application may also require
authenticated backup or independent key recovery.

## Project layout

```text
App.tsx                 User interface and application workflow
src/database.ts         SEE activation, encrypted open, schema, CRUD, and rekey
src/databaseKey.ts      Random database-key generation and secure storage
app.json                Expo native application configuration
.env.example            Activation-key configuration template
```

## Package compatibility

Do not install the upstream `expo-sqlite` package alongside
`@sqlite-encrypted/expo`. Both packages expose the native module named
`ExpoSQLite`.

SQLite.Encrypted is SEE-backed on Android and iOS. Expo web continues to use
the upstream web implementation and is not SEE-backed; this example therefore
reports an error when run on web.
