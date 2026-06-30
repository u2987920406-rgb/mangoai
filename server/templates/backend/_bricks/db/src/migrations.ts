// Liste ordonnée des migrations. Ajouter une migration = ajouter une entrée avec un id croissant
// (jamais modifier une migration déjà livrée : en créer une nouvelle).
import type { Migration } from "./migrate.js";

export const MIGRATIONS: Migration[] = [
  {
    // Table users — compatible avec le UserStore de la brique 'auth'.
    id: "001_init_users",
    up: `
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT    PRIMARY KEY,
        email         TEXT    NOT NULL UNIQUE,
        password_hash TEXT    NOT NULL,
        created_at    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `,
  },
];
