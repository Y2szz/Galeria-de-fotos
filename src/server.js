'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const db = require('./db');
const { upload, UPLOAD_DIR, ehVideo, MAX_MB } = require('./storage');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(PUBLIC));

app.use(session({
  secret: process.env.SESSION_SECRET || 'segredo-inseguro-troque-no-env',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

function exigirLogin(req, res, next) {
  if (!req.session || !req.session.userId) return res.status(401).json({ erro: 'Faca login.' });
  next();
}

// ---------- AUTENTICACAO ----------

app.post('/api/registro', async (req, res) => {
  const { nome, email, senha } = req.body || {};
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Preencha nome, email e senha.' });
  if (String(senha).length < 6) return res.status(400).json({ erro: 'A senha deve ter ao menos 6 caracteres.' });

  try {
    const info = db.prepare(
      'INSERT INTO users (nome, email, senha_hash) VALUES (?, ?, ?)'
    ).run(String(nome).trim(), String(email).toLowerCase().trim(),
           await bcrypt.hash(String(senha), 12));

    req.session.userId = info.lastInsertRowid;
    res.json({ ok: true });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ erro: 'Email ja cadastrado.' });
    res.status(500).json({ erro: 'Erro ao criar conta.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, senha } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase().trim());
  if (!user) return res.status(401).json({ erro: 'Email ou senha invalidos.' });

  const ok = await bcrypt.compare(String(senha || ''), user.senha_hash);
  if (!ok) return res.status(401).json({ erro: 'Email ou senha invalidos.' });

  req.session.userId = user.id;
  res.json({ ok: true, usuario: { id: user.id, nome: user.nome, email: user.email } });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/eu', exigirLogin, (req, res) => {
  const u = db.prepare('SELECT id, nome, email, criado_em FROM users WHERE id = ?').get(req.session.userId);
  if (!u) return res.status(401).json({ erro: 'Sessao expirada.' });
  res.json({ usuario: u });
});

// ---------- ALBUMS ----------

app.get('/api/albums', exigirLogin, (req, res) => {
  const albums = db.prepare(`
    SELECT a.id, a.nome, a.criado_em, COUNT(m.id) AS total
    FROM albums a
    LEFT JOIN midias m ON m.album_id = a.id
    WHERE a.user_id = ?
    GROUP BY a.id
    ORDER BY a.criado_em DESC
  `).all(req.session.userId);
  res.json({ albums });
});

app.post('/api/albums', exigirLogin, (req, res) => {
  const nome = String((req.body || {}).nome || '').trim();
  if (!nome) return res.status(400).json({ erro: 'Informe o nome do album.' });
  const info = db.prepare('INSERT INTO albums (user_id, nome) VALUES (?, ?)').run(req.session.userId, nome);
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.delete('/api/albums/:id', exigirLogin, (req, res) => {
  const arquivos = db.prepare('SELECT caminho FROM midias WHERE album_id = ? AND user_id = ?')
    .all(req.params.id, req.session.userId);
  db.prepare('DELETE FROM albums WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  for (const a of arquivos) {
    fs.promises.unlink(path.join(UPLOAD_DIR, a.caminho)).catch(() => {});
  }
  res.json({ ok: true });
});

// ---------- MIDIAS ----------

app.get('/api/midias', exigirLogin, (req, res) => {
  const { album_id, tipo, busca } = req.query;
  let sql = `SELECT id, album_id, titulo, tipo, mime, tamanho, criado_em
             FROM midias WHERE user_id = ?`;
  const args = [req.session.userId];
  if (album_id) { sql += ' AND album_id = ?'; args.push(album_id); }
  if (tipo === 'imagem' || tipo === 'video') { sql += ' AND tipo = ?'; args.push(tipo); }
  if (busca) { sql += ' AND (titulo LIKE ? OR nome_arquivo LIKE ?)'; args.push(`%${busca}%`, `%${busca}%`); }
  sql += ' ORDER BY id DESC';
  res.json({ midias: db.prepare(sql).all(...args) });
});

app.post('/api/upload', exigirLogin, (req, res) => {
  upload.array('arquivos', 20)(req, res, (err) => {
    if (err) return res.status(400).json({ erro: err.message });

    const albumId = req.body.album_id ? Number(req.body.album_id) : null;
    const tituloBase = String(req.body.titulo || '').trim();

    if (albumId) {
      const album = db.prepare('SELECT id FROM albums WHERE id = ? AND user_id = ?').get(albumId, req.session.userId);
      if (!album) {
        for (const f of req.files) fs.promises.unlink(path.join(UPLOAD_DIR, f.filename)).catch(() => {});
        return res.status(404).json({ erro: 'Album nao encontrado.' });
      }
    }

    const insere = db.prepare(`
      INSERT INTO midias (user_id, album_id, titulo, tipo, nome_arquivo, caminho, mime, tamanho)
      VALUES (@user_id, @album_id, @titulo, @tipo, @nome_arquivo, @caminho, @mime, @tamanho)
    `);
    const salvar = db.transaction((files) => {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        insere.run({
          user_id: req.session.userId,
          album_id: albumId,
          titulo: tituloBase || (files.length > 1 ? null : f.originalname),
          tipo: ehVideo(f.mimetype) ? 'video' : 'imagem',
          nome_arquivo: f.originalname,
          caminho: f.filename,
          mime: f.mimetype,
          tamanho: f.size
        });
      }
    });

    try {
      salvar(req.files);
      res.json({ ok: true, enviados: req.files.length });
    } catch (e) {
      for (const f of req.files) fs.promises.unlink(path.join(UPLOAD_DIR, f.filename)).catch(() => {});
      res.status(500).json({ erro: 'Erro ao salvar no banco.' });
    }
  });
});

app.put('/api/midias/:id', exigirLogin, (req, res) => {
  const { titulo, album_id } = req.body || {};
  const campos = [], args = [];
  if (typeof titulo === 'string') { campos.push('titulo = ?'); args.push(titulo.trim() || null); }
  if (album_id !== undefined) {
    campos.push('album_id = ?');
    args.push(album_id ? Number(album_id) : null);
  }
  if (!campos.length) return res.status(400).json({ erro: 'Nada para atualizar.' });
  args.push(req.params.id, req.session.userId);
  const r = db.prepare(`UPDATE midias SET ${campos.join(', ')} WHERE id = ? AND user_id = ?`).run(...args);
  if (!r.changes) return res.status(404).json({ erro: 'Midia nao encontrada.' });
  res.json({ ok: true });
});

app.delete('/api/midias/:id', exigirLogin, (req, res) => {
  const m = db.prepare('SELECT caminho FROM midias WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!m) return res.status(404).json({ erro: 'Midia nao encontrada.' });
  db.prepare('DELETE FROM midias WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  fs.promises.unlink(path.join(UPLOAD_DIR, m.caminho)).catch(() => {});
  res.json({ ok: true });
});

app.get('/api/arquivo/:id', exigirLogin, (req, res) => {
  const m = db.prepare('SELECT caminho, mime, nome_arquivo FROM midias WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);
  if (!m) return res.status(404).end();
  res.type(m.mime);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(m.nome_arquivo)}"`);
  res.sendFile(path.join(UPLOAD_DIR, m.caminho));
});

app.get('/api/uso', exigirLogin, (req, res) => {
  const r = db.prepare(`
    SELECT COUNT(*) AS total,
           COALESCE(SUM(tamanho), 0) AS bytes,
           COALESCE(SUM(CASE WHEN tipo='video' THEN 1 ELSE 0 END), 0) AS videos
    FROM midias WHERE user_id = ?
  `).get(req.session.userId);
  res.json({ ...r, limite_bytes: MAX_MB * 1024 * 1024 });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno.' });
});

fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });

app.listen(PORT, () => {
  console.log(`Galeria rodando em http://localhost:${PORT}`);
});
