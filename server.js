import fs from 'node:fs';
import { loadConfig } from './src/config.js';
import { openDatabase } from './src/db.js';
import { createApp } from './src/app.js';
import { ensureDefaultUsers } from './src/auth/users.js';

if (fs.existsSync('.env')) process.loadEnvFile('.env');

const config = loadConfig();
const db = openDatabase(config.dbPath);
const { app, users } = createApp({ db, config });

for (const account of ensureDefaultUsers(users, config)) {
  // Only a generated password is printed (once) — configured passwords must never reach the logs.
  const detail = account.generated
    ? `with generated password: ${account.password} (change it from Settings after signing in)`
    : 'with the configured password';
  console.info(`[setup] Created ${account.role} account "${account.username}" ${detail}`);
}

const server = app.listen(config.port, config.host, () => {
  console.info(`[ready] ${config.templeName} directory is running at http://localhost:${config.port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
