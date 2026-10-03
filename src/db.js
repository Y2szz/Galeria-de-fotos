'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
require('dotenv').config();

const DB_FILE = path.resolve(__dirname, '..', process.env.DB_FILE || './data/galeria.db');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nome       TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS albums (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nome       TEXT NOT NULL,
    criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS midias (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    album_id     INTEGER REFERENCES albums(id) ON DELETE SET NULL,
    titulo       TEXT,
    tipo         TEXT NOT NULL,          -- 'imagem' | 'video'
    nome_arquivo TEXT NOT NULL,
    caminho      TEXT NOT NULL,          -- caminho relativo dentro de /uploads
    mime         TEXT NOT NULL,
    tamanho      INTEGER NOT NULL,       -- bytes
    criado_em    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_midias_user  ON midias(user_id);
  CREATE INDEX IF NOT EXISTS idx_midias_album ON midias(album_id);
`);

module.exports = db;
