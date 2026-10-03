'use strict';

const app = document.getElementById('app');
const estado = { usuario: null, albums: [], midias: [], albumSel: '', tipo: '', busca: '', indice: 0 };

const fmtBytes = (b) => b < 1024 ? b + ' B'
  : b < 1048576 ? (b / 1024).toFixed(1) + ' KB'
    : b < 1073741824 ? (b / 1048576).toFixed(1) + ' MB'
      : (b / 1073741824).toFixed(2) + ' GB';

async function api(url, opcoes = {}) {
  const r = await fetch(url, {
    credentials: 'same-origin',
    ...opcoes,
    headers: opcoes.body ? { 'Content-Type': 'application/json' } : undefined
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro || 'Erro na requisição');
  return dados;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ================= LOGIN ================= */

function telaAuth(modo = 'login', erro = '') {
  const cadastro = modo === 'cadastro';
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="card-auth">
        <h1>📸 Galeria</h1>
        <p class="sub">Guarde suas fotos e videos com seguranca.</p>
        <div class="abas">
          <button id="abLogin" class="${cadastro ? '' : 'ativa'}">Entrar</button>
          <button id="abCad" class="${cadastro ? 'ativa' : ''}">Criar conta</button>
        </div>
        <form id="formAuth">
          ${cadastro ? '<div><label>Nome</label><input name="nome" required autocomplete="name"></div>' : ''}
          <div><label>Email</label><input name="email" type="email" required autocomplete="email"></div>
          <div><label>Senha</label><input name="senha" type="password" required minlength="6" autocomplete="current-password"></div>
          <button class="btn" type="submit">${cadastro ? 'Criar conta' : 'Entrar'}</button>
          <div class="msg ${erro ? 'erro' : ''}" id="msgAuth">${esc(erro)}</div>
        </form>
      </div>
    </div>`;

  document.getElementById('abLogin').onclick = () => telaAuth('login');
  document.getElementById('abCad').onclick = () => telaAuth('cadastro');
  document.getElementById('formAuth').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const msg = document.getElementById('msgAuth');
    msg.className = 'msg';
    msg.textContent = 'Aguarde...';
    try {
      const corpo = Object.fromEntries(f);
      await api(cadastro ? '/api/registro' : '/api/login', { method: 'POST', body: JSON.stringify(corpo) });
      await iniciar();
    } catch (err) {
      msg.className = 'msg erro';
      msg.textContent = err.message;
    }
  };
}

/* ================= GALERIA ================= */

async function iniciar() {
  try {
    const { usuario } = await api('/api/eu');
    estado.usuario = usuario;
    await carregar();
    telaGaleria();
  } catch {
    estado.usuario = null;
    telaAuth('login');
  }
}

async function carregar() {
  const params = new URLSearchParams();
  if (estado.albumSel) params.set('album_id', estado.albumSel);
  if (estado.tipo) params.set('tipo', estado.tipo);
  if (estado.busca) params.set('busca', estado.busca);
  const [a, m, u] = await Promise.all([
    api('/api/albums'),
    api('/api/midias?' + params),
    api('/api/uso')
  ]);
  estado.albums = a.albums;
  estado.midias = m.midias;
  estado.uso = u;
}

function telaGaleria() {
  const u = estado.usuario;
  app.innerHTML = `
    <header class="topo">
      <div class="logo">📸 <span>Galeria</span></div>
      <div class="usuario">Ola, ${esc(u.nome)}</div>
      <div class="espaco"></div>
      <div class="uso">${estado.uso.total} arquivos · ${fmtBytes(estado.uso.bytes)}</div>
      <button class="btn btn-sec" id="btnSair">Sair</button>
    </header>
    <main>
      <section class="painel">
        <h2>Enviar arquivos</h2>
        <div class="linha">
          <div><label>Album</label><select id="selAlbum"></select></div>
          <div><label>Titulo (opcional)</label><input id="inpTitulo" placeholder="Ex: viagem 2026"></div>
        </div>
        <div class="dropzone" id="dropzone">
          Clique ou arraste fotos/videos aqui<br>
          <small>ate ${Math.round(estado.uso.limite_bytes / 1048576)} MB por arquivo</small>
          <input type="file" id="inpArquivos" multiple accept="image/*,video/*" hidden>
        </div>
        <div class="barra-progresso"><i id="prog"></i></div>
        <div class="msg" id="msgUp"></div>
      </section>

      <section class="painel">
        <h2>Meus albums</h2>
        <div class="linha">
          <div><input id="inpAlbum" placeholder="Nome do novo album"></div>
          <button class="btn btn-sec" id="btnAlbum" style="margin-bottom:0">Criar</button>
        </div>
      </section>

      <div class="barra-filtros">
        <input id="inpBusca" placeholder="Buscar por titulo...">
        <select id="selTipo">
          <option value="">Todos os tipos</option>
          <option value="imagem">Somente fotos</option>
          <option value="video">Somente videos</option>
        </select>
        <button class="btn btn-sec" id="btnLimpar">Limpar filtros</button>
      </div>
      <div class="albums" id="chips"></div>
      <div class="grade" id="grade"></div>
    </main>`;

  document.getElementById('btnSair').onclick = async () => { await api('/api/logout', { method: 'POST' }); location.reload(); };
  document.getElementById('btnAlbum').onclick = criarAlbum;
  document.getElementById('btnLimpar').onclick = () => {
    estado.albumSel = ''; estado.tipo = ''; estado.busca = '';
    recarregar();
  };
  document.getElementById('selTipo').value = estado.tipo;
  document.getElementById('inpBusca').value = estado.busca;

  const selAlbum = document.getElementById('selAlbum');
  selAlbum.innerHTML = '<option value="">Sem album</option>' +
    estado.albums.map((a) => `<option value="${a.id}" ${a.id == estado.albumSel ? 'selected' : ''}>${esc(a.nome)} (${a.total})</option>`).join('');
  selAlbum.onchange = () => { estado.albumSel = selAlbum.value; carregar().then(telaGaleria); };

  document.getElementById('selTipo').onchange = (e) => { estado.tipo = e.target.value; recarregar(); };
  let t;
  document.getElementById('inpBusca').oninput = (e) => {
    clearTimeout(t);
    t = setTimeout(() => { estado.busca = e.target.value.trim(); recarregar(); }, 350);
  };

  const dz = document.getElementById('dropzone');
  const inp = document.getElementById('inpArquivos');
  dz.onclick = () => inp.click();
  inp.onchange = () => { if (inp.files.length) enviar(inp.files); inp.value = ''; };
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('hover'); };
  dz.ondragleave = () => dz.classList.remove('hover');
  dz.ondrop = (e) => {
    e.preventDefault(); dz.classList.remove('hover');
    if (e.dataTransfer.files.length) enviar(e.dataTransfer.files);
  };

  desenharChips();
  desenharGrade();
}

async function recarregar() { await carregar(); telaGaleria(); }

async function criarAlbum() {
  const inp = document.getElementById('inpAlbum');
  const nome = inp.value.trim();
  if (!nome) return;
  try {
    const r = await api('/api/albums', { method: 'POST', body: JSON.stringify({ nome }) });
    inp.value = '';
    estado.albumSel = String(r.id);
    await recarregar();
  } catch (e) { alert(e.message); }
}

function desenharChips() {
  const box = document.getElementById('chips');
  box.innerHTML = `<button class="chip ${!estado.albumSel ? 'ativa' : ''}" data-album="">Todos</button>` +
    estado.albums.map((a) => `
      <span style="display:inline-flex;align-items:center;gap:4px">
        <button class="chip ${String(estado.albumSel) === String(a.id) ? 'ativa' : ''}" data-album="${a.id}">${esc(a.nome)} (${a.total})</button>
        <button class="chip" data-del="${a.id}" title="Excluir album">🗑</button>
      </span>`).join('');

  box.querySelectorAll('[data-album]').forEach((b) => {
    b.onclick = () => { estado.albumSel = b.dataset.album; recarregar(); };
  });
  box.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Excluir este album e as midias dele?')) return;
      await api(`/api/albums/${b.dataset.del}`, { method: 'DELETE' });
      if (estado.albumSel === b.dataset.del) estado.albumSel = '';
      recarregar();
    };
  });
}

function desenharGrade() {
  const grade = document.getElementById('grade');
  if (!estado.midias.length) {
    grade.innerHTML = '<div class="vazio" style="grid-column:1/-1">Nenhum arquivo por aqui ainda. Envie o primeiro! 📁</div>';
    return;
  }
  grade.innerHTML = estado.midias.map((m, i) => {
    const src = `/api/arquivo/${m.id}`;
    const mid = m.tipo === 'video'
      ? `<video src="${src}" preload="metadata" muted playsinline></video>`
      : `<img src="${src}" alt="${esc(m.titulo || m.nome_arquivo)}" loading="lazy">`;
    return `
      <div class="item" data-i="${i}">
        <div class="moldura">${mid}</div>
        <div class="info">
          <div class="titulo" title="${esc(m.titulo || m.nome_arquivo)}">${esc(m.titulo || m.nome_arquivo)}</div>
          <div class="meta">${m.tipo === 'video' ? '🎬' : '🖼'} ${fmtBytes(m.tamanho)}</div>
        </div>
        <div class="acoes">
          <button data-rename="${m.id}">Renomear</button>
          <button data-del="${m.id}" data-del-tipo="midia">Excluir</button>
        </div>
      </div>`;
  }).join('');

  grade.querySelectorAll('.item').forEach((el) => {
    el.onclick = (e) => {
      if (e.target.closest('button')) return;
      abrirLightbox(Number(el.dataset.i));
    };
  });
  grade.querySelectorAll('[data-rename]').forEach((b) => {
    b.onclick = async () => {
      const t = prompt('Novo titulo:');
      if (t === null) return;
      await api(`/api/midias/${b.dataset.rename}`, { method: 'PUT', body: JSON.stringify({ titulo: t }) });
      recarregar();
    };
  });
  grade.querySelectorAll('[data-del-tipo]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Excluir este arquivo?')) return;
      await api(`/api/midias/${b.dataset.del}`, { method: 'DELETE' });
      recarregar();
    };
  });
}

async function enviar(files) {
  const fd = new FormData();
  for (const f of files) fd.append('arquivos', f);
  const album = document.getElementById('selAlbum').value;
  if (album) fd.set('album_id', album);
  const titulo = document.getElementById('inpTitulo').value.trim();
  if (titulo) fd.set('titulo', titulo);

  const prog = document.getElementById('prog');
  const msg = document.getElementById('msgUp');
  msg.className = 'msg';
  msg.textContent = 'Enviando...';

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload');
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) prog.style.width = (e.loaded / e.total * 100) + '%';
  };
  xhr.onload = async () => {
    prog.style.width = '0';
    const r = JSON.parse(xhr.responseText || '{}');
    if (xhr.status === 200) {
      msg.className = 'msg ok';
      msg.textContent = `✅ ${r.enviados} arquivo(s) enviado(s).`;
      document.getElementById('inpTitulo').value = '';
      await recarregar();
    } else {
      msg.className = 'msg erro';
      msg.textContent = r.erro || 'Falha no envio.';
    }
  };
  xhr.onerror = () => { prog.style.width = '0'; msg.className = 'msg erro'; msg.textContent = 'Erro de rede.'; };
  xhr.send(fd);
}

/* ================= LIGHTBOX ================= */

const lb = document.getElementById('lightbox');
const lbConteudo = document.getElementById('lbConteudo');

function abrirLightbox(i) {
  estado.indice = i;
  lb.classList.remove('oculto');
  pintarLightbox();
}
function pintarLightbox() {
  const m = estado.midias[estado.indice];
  if (!m) return;
  const src = `/api/arquivo/${m.id}`;
  lbConteudo.innerHTML = m.tipo === 'video'
    ? `<video src="${src}" controls autoplay></video>`
    : `<img src="${src}" alt="">`;
}
function fecharLightbox() { lb.classList.add('oculto'); lbConteudo.innerHTML = ''; }

document.getElementById('lbFechar').onclick = fecharLightbox;
document.getElementById('lbAnt').onclick = () => {
  estado.indice = (estado.indice - 1 + estado.midias.length) % estado.midias.length; pintarLightbox();
};
document.getElementById('lbProx').onclick = () => {
  estado.indice = (estado.indice + 1) % estado.midias.length; pintarLightbox();
};
document.addEventListener('keydown', (e) => {
  if (lb.classList.contains('oculto')) return;
  if (e.key === 'Escape') fecharLightbox();
  if (e.key === 'ArrowLeft') document.getElementById('lbAnt').click();
  if (e.key === 'ArrowRight') document.getElementById('lbProx').click();
});

iniciar();
