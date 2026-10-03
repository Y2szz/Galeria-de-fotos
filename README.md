# 📸 Galeria de Fotos e Videos

Site completo (backend + frontend) para **entrar com login** e **guardar fotos e vídeos** em uma galeria privada, com banco de dados.

## Como rodar

Você precisa do **Node.js 18+** instalado (https://nodejs.org). Depois:

```bash
npm install
npm start
```

Abra no navegador: **http://localhost:3000**

Crie uma conta na aba "Criar conta" e comece a enviar arquivos.

## O que tem

**Backend** (`src/`)
- `server.js` — API REST + servidor de arquivos estáticos
- `db.js` — banco **SQLite** (arquivo `data/galeria.db`) com tabelas `users`, `albums`, `midias`
- `storage.js` — upload com validação de tipo e tamanho

**Frontend** (`public/`)
- `index.html`, `styles.css`, `app.js` — tela de login/cadastro, galeria em grade, filtros, drag-and-drop com barra de progresso e visualizador de mídia em tela cheia

**Recursos**
- 🔐 Cadastro e login com senha criptografada (bcrypt) + sessão em cookie
- 📁 Albums para organizar as mídias
- 🖼🎬 Upload de fotos e vídeos (até 20 por vez), com barra de progresso
- 🔎 Busca e filtro por tipo (foto/vídeo) e por álbum
- ✏️ Renomear e excluir arquivos e álbuns
- ⬅️➡️ Visualizador com setas do teclado
- 📊 Contador de arquivos e espaço usado no cabeçalho

## Configuração (opcional)

Copie `.env.example` para `.env` e ajuste:

```
PORT=3000
SESSION_SECRET=uma-chave-longa-e-aleatoria
MAX_FILE_MB=200
```

## API

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/registro` | Criar conta |
| POST | `/api/login` | Entrar |
| POST | `/api/logout` | Sair |
| GET | `/api/eu` | Dados do usuário logado |
| GET/POST | `/api/albums` | Listar / criar álbuns |
| DELETE | `/api/albums/:id` | Excluir álbum |
| GET | `/api/midias` | Listar (filtros: `album_id`, `tipo`, `busca`) |
| POST | `/api/upload` | Enviar arquivos (`multipart/form-data`) |
| PUT | `/api/midias/:id` | Renomear / mover de álbum |
| DELETE | `/api/midias/:id` | Excluir arquivo |
| GET | `/api/arquivo/:id` | Baixar/streaming do arquivo (só o dono) |
| GET | `/api/uso` | Total de arquivos e bytes usados |

Os arquivos físicos ficam em `uploads/`, os dados em `data/`. Ambos são ignorados pelo Git.
