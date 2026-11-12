// Clientes e Compras Radar (online). Telas simples, sem build. Os dados vêm das funções radar_* do Supabase,
// que só respondem para quem é da equipe do Giftback Acker (mesmo login, mesmo endereço natubrava.github.io).
import { SUPABASE_URL, SUPABASE_CHAVE_PUBLICA, SUPABASE_JS } from './config.js?v=20261112134923';
import {
  formatarTelefone, linkWhatsapp, reais, dataBR, haDias, quantidade, mensagemRecompra, csv, pedidoDaUrl,
  filtrarCompradores, numeroWhatsapp,
} from './util.js?v=20261112134923';

const tela = document.getElementById('tela');
const situacaoEl = document.getElementById('situacao');
let supabase;
const estado = { aba: 'clientes', busca: '', buscaProduto: '' };

// ───────────── utilidades de tela ─────────────
function h(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return el;
}
const trocar = (el, ...filhos) => { el.replaceChildren(...filhos.flat(Infinity).filter((f) => f !== null && f !== undefined && f !== false)); return el; };
let avisoTimer;
function avisar(texto, tipo = '') {
  const a = document.getElementById('aviso');
  a.textContent = texto; a.className = 'aviso ' + tipo; a.hidden = false;
  clearTimeout(avisoTimer); avisoTimer = setTimeout(() => { a.hidden = true; }, 4000);
}
async function rpc(nome, args = {}) {
  const { data, error } = await supabase.rpc(nome, args);
  if (error) {
    if (/JWT|session|not authenticated/i.test(error.message)) { telaLogin('Sua sessão expirou. Entre de novo.'); throw error; }
    throw new Error(/Sem permiss/.test(error.message) ? 'Este e-mail não tem acesso ao Radar.' : error.message);
  }
  return data;
}
function debounce(fn, ms = 300) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function botaoWhats(tel, texto, rotulo = 'WhatsApp') {
  const url = linkWhatsapp(tel, texto);
  return url ? h('a', { class: 'botao whats', href: url, target: 'whatsapp', rel: 'noopener' }, rotulo) : null;
}
function baixar(nomeArquivo, conteudo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
  const a = h('a', { href: url, download: nomeArquivo }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ───────────── situação da atualização ─────────────
async function mostrarSituacao() {
  try {
    const s = await rpc('radar_situacao');
    const partes = [];
    if (s.carga_inicial) partes.push(h('b', {}, 'Puxando o histórico do Uniplus pela primeira vez. '), s.mensagem || '');
    else partes.push('Vendas até ', h('b', {}, dataBR(s.ultima_venda)),
      s.ultima_ok ? ` · atualizado em ${new Date(s.ultima_ok).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : '',
      ' · atualiza sozinho toda noite');
    if (s.mensagem && /^Erro/.test(s.mensagem)) partes.push(h('span', { class: 'vermelho' }, ' · Última tentativa: ' + s.mensagem));
    const botao = h('button', { class: 'link', type: 'button', disabled: s.rodando ? true : null, onclick: atualizarAgora },
      s.rodando ? 'atualizando…' : 'Atualizar agora');
    trocar(situacaoEl, h('span', {}, ...partes), botao);
    situacaoEl.hidden = false;
    return s;
  } catch { situacaoEl.hidden = true; return null; }
}
async function atualizarAgora() {
  if (!confirm('Atualizar agora entra no Uniplus Web com o usuário do caixa e DERRUBA a sessão dele, se estiver aberta.\n\nO normal é deixar atualizar sozinho à noite. Atualizar agora mesmo assim?')) return;
  try {
    const r = await rpc('radar_pedir_atualizacao');
    avisar(r === 'ja_rodando' ? 'Já está atualizando.' : 'Atualização pedida. Leva de 1 a 2 minutos.');
    setTimeout(mostrarSituacao, 3000); setTimeout(mostrarSituacao, 60000); setTimeout(mostrarSituacao, 130000);
  } catch (e) { avisar(e.message, 'erro'); }
}

// ───────────── CLIENTES ─────────────
function cartaoCliente(c, aoAbrir) {
  return h('button', { class: 'cartao cliente-item', type: 'button', onclick: () => aoAbrir(c.id) },
    h('span', { class: 'cliente-nome' }, c.nome, c.fidelidade ? h('span', { class: 'etiqueta verde' }, 'Club') : null,
      c.ativo === false ? h('span', { class: 'etiqueta cinza' }, 'inativo') : null),
    h('span', { class: 'suave pequeno' }, formatarTelefone(c.telefone) || 'sem telefone'),
    h('span', { class: 'cliente-numeros' },
      h('span', {}, h('b', {}, c.compras || 0), ' compras'),
      h('span', {}, h('b', {}, reais(c.total || 0))),
      c.ultima ? h('span', { class: 'suave' }, 'última ', dataBR(c.ultima)) : null));
}

async function telaClientes() {
  const lista = h('div', { class: 'lista' });
  const entrada = h('input', { type: 'search', class: 'entrada grande', value: estado.busca, placeholder: 'Nome, celular ou CPF do cliente', autocomplete: 'off' });
  const buscar = debounce(async () => {
    estado.busca = entrada.value;
    const q = entrada.value.trim();
    if (q.replace(/\D/g, '').length < 8 && q.length < 2) { trocar(lista, h('p', { class: 'suave' }, 'Digite pelo menos 2 letras do nome, ou 8 números do celular.')); return; }
    trocar(lista, h('p', { class: 'suave' }, 'Buscando…'));
    try {
      const r = await rpc('radar_buscar_clientes', { p_q: q, p_lim: 40 });
      trocar(lista, r.length ? r.map((c) => cartaoCliente(c, abrirCliente)) : h('p', { class: 'suave' }, 'Nenhum cliente encontrado no Uniplus.'));
    } catch (e) { trocar(lista, h('p', { class: 'vermelho' }, e.message)); }
  });
  entrada.addEventListener('input', buscar);
  trocar(tela, h('section', {}, h('h1', {}, 'Quem comprou o quê?'),
    h('p', { class: 'suave' }, 'Abra o cliente para ver tudo o que ele já levou e oferecer de novo.'),
    entrada, lista));
  entrada.focus();
  if (estado.busca) buscar();
  else trocar(lista, h('p', { class: 'suave' }, 'Digite pelo menos 2 letras do nome, ou 8 números do celular.'));
}

/** Link vindo do Giftback: ?telefone=47999998888&nome=Fulano */
async function abrirPorTelefone(tel, nome) {
  trocar(tela, h('p', { class: 'carregando' }, 'Procurando o cliente…'));
  let r = [];
  try { r = tel ? await rpc('radar_buscar_clientes', { p_q: tel, p_lim: 10 }) : []; } catch (e) { avisar(e.message, 'erro'); }
  if (r.length === 1) return abrirCliente(r[0].id);
  if (r.length > 1) {
    return trocar(tela, h('section', {}, h('h1', {}, 'Mais de um cliente com este celular'),
      h('p', { class: 'suave' }, 'Escolha qual é:'), h('div', { class: 'lista' }, r.map((c) => cartaoCliente(c, abrirCliente)))));
  }
  // Não achou pelo celular: tenta pelo nome
  let porNome = [];
  if (nome) { try { porNome = await rpc('radar_buscar_clientes', { p_q: nome, p_lim: 20 }); } catch { /* segue */ } }
  // Nome completo não achou (no Uniplus pode estar escrito diferente): tenta só o primeiro nome
  const primeiro = (nome || '').trim().split(/\s+/)[0] || '';
  if (!porNome.length && primeiro.length >= 3 && primeiro !== nome.trim()) {
    try { porNome = await rpc('radar_buscar_clientes', { p_q: primeiro, p_lim: 30 }); } catch { /* segue */ }
  }
  trocar(tela, h('section', {},
    h('h1', {}, 'Celular não encontrado no Uniplus'),
    h('p', {}, `O celular ${formatarTelefone(tel)} não está no cadastro de clientes do Uniplus (ou está escrito diferente lá).`),
    porNome.length ? [h('p', { class: 'suave', style: 'margin-top:12px' }, `Clientes com nome parecido com "${nome}":`),
      h('div', { class: 'lista' }, porNome.map((c) => cartaoCliente(c, abrirCliente)))]
      : h('p', { class: 'suave' }, 'Busque pelo nome na aba Clientes.'),
    h('button', { class: 'botao', style: 'margin-top:16px', onclick: () => { history.replaceState(null, '', location.pathname + '#clientes'); estado.busca = nome; telaClientes(); } }, 'Buscar na aba Clientes')));
}

async function abrirCliente(id, reserva) {
  history.replaceState(null, '', `${location.pathname}?cliente=${encodeURIComponent(id)}#clientes`);
  window.scrollTo({ top: 0 });
  trocar(tela, h('p', { class: 'carregando' }, 'Carregando compras…'));
  let d;
  try { d = await rpc('radar_cliente', { p_id: id }); } catch (e) { trocar(tela, h('p', { class: 'vermelho' }, e.message)); return; }
  if (!d && reserva?.telefone) return abrirPorTelefone(reserva.telefone, reserva.nome); // código desconhecido: tenta pelo celular
  if (!d) { trocar(tela, h('p', { class: 'vermelho' }, 'Cliente não encontrado.')); return; }
  const c = d.cliente, r = d.resumo || {};
  const voltar = h('button', { class: 'link', type: 'button', onclick: () => { history.replaceState(null, '', location.pathname + '#clientes'); telaClientes(); } }, '← Voltar à busca');
  const cab = h('div', { class: 'cartao cabecalho-cliente' },
    h('div', {}, h('h1', {}, c.nome, c.fidelidade ? h('span', { class: 'etiqueta verde' }, 'Club') : null),
      h('p', { class: 'suave' }, formatarTelefone(c.telefone) || 'sem telefone', c.cpf ? ` · CPF •••${String(c.cpf).slice(-3)}` : '')),
    botaoWhats(c.telefone, '', 'Abrir WhatsApp'));
  const numeros = h('div', { class: 'numeros' },
    [['Compras', r.compras || 0], ['Total gasto', reais(r.total || 0)], ['Ticket médio', reais(r.ticket)],
      ['Primeira compra', dataBR(r.primeira)], ['Última compra', r.ultima ? `${dataBR(r.ultima)} (${haDias(Math.round((Date.now() - new Date(r.ultima + 'T12:00:00-03:00')) / 864e5))})` : '—']]
      .map(([t, v]) => h('div', { class: 'numero' }, h('small', {}, t), h('b', {}, v))));

  const corpo = h('div');
  let aba = 'produtos';
  const botoesAba = h('div', { class: 'subabas' });
  const mostrar = () => {
    trocar(botoesAba, [['produtos', `Produtos que comprou (${d.produtos.length})`], ['compras', `Compras (${d.compras.length})`]]
      .map(([k, t]) => h('button', { type: 'button', class: 'subaba' + (k === aba ? ' ativa' : ''), onclick: () => { aba = k; mostrar(); } }, t)));
    trocar(corpo, aba === 'produtos' ? produtosDoCliente(c, d.produtos) : comprasDoCliente(d.compras));
  };
  mostrar();
  trocar(tela, h('section', {}, voltar, cab, numeros, botoesAba, corpo));
}

function produtosDoCliente(cliente, produtos) {
  const escolhidos = new Set();
  const filtro = h('input', { type: 'search', class: 'entrada', placeholder: 'Filtrar produto…' });
  const corpoTabela = h('tbody');
  const barra = h('div', { class: 'barra-acao' });
  const desenharBarra = () => {
    const sel = produtos.filter((p) => escolhidos.has(p.codigo));
    const texto = sel.length ? mensagemRecompra(cliente.nome, sel) : '';
    trocar(barra, sel.length
      ? [h('span', {}, h('b', {}, sel.length), ' produto(s) marcado(s)'),
        botaoWhats(cliente.telefone, texto, 'Oferecer de novo no WhatsApp') || h('span', { class: 'suave' }, 'Cliente sem celular válido'),
        h('button', { class: 'link', type: 'button', onclick: () => { escolhidos.clear(); desenhar(); } }, 'limpar')]
      : h('span', { class: 'suave' }, 'Marque os produtos para montar a mensagem de recompra.'));
  };
  const desenhar = () => {
    const q = filtro.value.trim().toLowerCase();
    const lista = produtos.filter((p) => !q || String(p.nome).toLowerCase().includes(q) || String(p.codigo) === q);
    trocar(corpoTabela, lista.map((p) => h('tr', { class: escolhidos.has(p.codigo) ? 'marcado' : '' },
      h('td', {}, h('input', { type: 'checkbox', checked: escolhidos.has(p.codigo) ? true : null,
        onchange: (e) => { e.target.checked ? escolhidos.add(p.codigo) : escolhidos.delete(p.codigo); desenhar(); } })),
      h('td', {}, h('b', {}, p.nome), h('br'), h('span', { class: 'suave pequeno' }, 'cód. ', p.codigo)),
      h('td', { class: 'num' }, p.vezes, 'x'),
      h('td', { class: 'num' }, quantidade(p.quantidade)),
      h('td', { class: 'num' }, reais(p.total)),
      h('td', {}, dataBR(p.ultima), h('br'), h('span', { class: p.dias > 60 ? 'ambar pequeno' : 'suave pequeno' }, haDias(p.dias))))));
    desenharBarra();
  };
  filtro.addEventListener('input', desenhar);
  desenhar();
  if (!produtos.length) return h('p', { class: 'suave' }, 'Nenhuma compra concluída com itens.');
  return h('div', { class: 'cartao' }, h('div', { class: 'linha-flex' }, filtro), barra,
    h('div', { class: 'rolagem' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Produto'), h('th', { class: 'num' }, 'Vezes'), h('th', { class: 'num' }, 'Qtd. total'), h('th', { class: 'num' }, 'Gasto'), h('th', {}, 'Última vez'))),
      corpoTabela)));
}

function comprasDoCliente(compras) {
  if (!compras.length) return h('p', { class: 'suave' }, 'Nenhuma compra encontrada.');
  return h('div', { class: 'compras' }, compras.map((v) => {
    const itens = h('div', { class: 'itens', hidden: true },
      h('table', {}, h('tbody', {}, v.itens.map((i) => h('tr', {},
        h('td', {}, i.nome || 'Produto ' + i.codigo, h('span', { class: 'suave pequeno' }, ' · cód. ', i.codigo)),
        h('td', { class: 'num' }, quantidade(i.quantidade)),
        h('td', { class: 'num' }, reais(i.unitario)),
        h('td', { class: 'num' }, reais(i.total)))))));
    const cab = h('button', { type: 'button', class: 'compra-cab', onclick: () => { itens.hidden = !itens.hidden; cab.classList.toggle('aberta', !itens.hidden); } },
      h('span', {}, h('b', {}, dataBR(v.data)), v.hora ? h('span', { class: 'suave' }, ' ', String(v.hora).slice(0, 5)) : null),
      h('span', { class: 'suave pequeno' }, `${v.itens.length} ${v.itens.length === 1 ? 'item' : 'itens'}`, v.documento ? ` · NFC-e ${v.documento}` : ''),
      v.status !== 'concluida' ? h('span', { class: 'etiqueta vermelha' }, v.status) : null,
      h('b', { class: 'num' }, reais(v.valor)), h('span', { class: 'seta' }, '▸'));
    return h('div', { class: 'cartao compra' + (v.status !== 'concluida' ? ' cancelada' : '') }, cab, itens);
  }));
}

// ───────────── PRODUTOS ─────────────
async function telaProdutos() {
  const lista = h('div', { class: 'lista' });
  const entrada = h('input', { type: 'search', class: 'entrada grande', value: estado.buscaProduto, placeholder: 'Nome ou código do produto', autocomplete: 'off' });
  const buscar = debounce(async () => {
    estado.buscaProduto = entrada.value;
    const q = entrada.value.trim();
    if (!q) { trocar(lista, h('p', { class: 'suave' }, 'Digite o nome ou o código do produto.')); return; }
    try {
      const r = await rpc('radar_buscar_produtos', { p_q: q, p_lim: 40 });
      trocar(lista, r.length ? r.map((p) => h('button', { type: 'button', class: 'cartao cliente-item', onclick: () => abrirProduto(p.codigo) },
        h('span', { class: 'cliente-nome' }, p.nome), h('span', { class: 'suave pequeno' }, 'cód. ', p.codigo, ' · última venda ', dataBR(p.ultima_venda))))
        : h('p', { class: 'suave' }, 'Nenhum produto vendido com esse nome.'));
    } catch (e) { trocar(lista, h('p', { class: 'vermelho' }, e.message)); }
  });
  entrada.addEventListener('input', buscar);
  trocar(tela, h('section', {}, h('h1', {}, 'Quem compra este produto?'),
    h('p', { class: 'suave' }, 'Veja quem já levou um produto e chame quem está há tempo sem comprar.'), entrada, lista));
  entrada.focus();
  if (estado.buscaProduto) buscar(); else trocar(lista, h('p', { class: 'suave' }, 'Digite o nome ou o código do produto.'));
}

async function abrirProduto(codigo) {
  trocar(tela, h('p', { class: 'carregando' }, 'Carregando compradores…'));
  let d;
  try { d = await rpc('radar_compradores', { p_codigo: codigo }); } catch (e) { trocar(tela, h('p', { class: 'vermelho' }, e.message)); return; }
  const p = d.produto || { codigo, nome: 'Produto ' + codigo };
  const todos = d.compradores || [];
  const f = { minDias: '', maxDias: '', minVezes: '', comTelefone: false };
  const campo = (rotulo, chave, ph) => h('label', {}, rotulo, h('input', { type: 'number', min: '0', class: 'entrada', placeholder: ph,
    oninput: (e) => { f[chave] = e.target.value; desenhar(); } }));
  const corpoTabela = h('tbody');
  const contagem = h('span');
  let atuais = [];
  const desenhar = () => {
    atuais = filtrarCompradores(todos, f);
    trocar(contagem, h('b', {}, atuais.length), ` de ${todos.length} clientes`);
    trocar(corpoTabela, atuais.map((c) => h('tr', {},
      h('td', {}, h('button', { class: 'link forte', type: 'button', onclick: () => abrirCliente(c.id) }, c.nome),
        c.fidelidade ? h('span', { class: 'etiqueta verde' }, 'Club') : null, h('br'),
        h('span', { class: 'suave pequeno' }, formatarTelefone(c.telefone) || 'sem telefone')),
      h('td', { class: 'num' }, c.vezes, 'x'),
      h('td', { class: 'num' }, quantidade(c.quantidade)),
      h('td', {}, dataBR(c.ultima), h('br'), h('span', { class: c.dias > 60 ? 'ambar pequeno' : 'suave pequeno' }, haDias(c.dias))),
      h('td', {}, botaoWhats(c.telefone, mensagemRecompra(c.nome, [p]), 'WhatsApp')))));
  };
  const copiar = async () => {
    const fones = [...new Set(atuais.map((c) => numeroWhatsapp(c.telefone)).filter(Boolean))];
    try { await navigator.clipboard.writeText(fones.join('\n')); avisar(`${fones.length} celulares copiados.`); } catch { avisar('Não foi possível copiar.', 'erro'); }
  };
  const exportar = () => baixar(`compradores-${p.codigo}.csv`, csv(atuais, [['Nome', 'nome'], ['Celular', (c) => formatarTelefone(c.telefone)],
    ['Vezes', 'vezes'], ['Quantidade', (c) => quantidade(c.quantidade)], ['Última compra', (c) => dataBR(c.ultima)], ['Dias', 'dias']]));
  desenhar();
  trocar(tela, h('section', {},
    h('button', { class: 'link', type: 'button', onclick: telaProdutos }, '← Voltar à busca'),
    h('div', { class: 'cartao' }, h('h1', {}, p.nome), h('p', { class: 'suave' }, 'cód. ', p.codigo)),
    h('div', { class: 'cartao filtros' },
      campo('Sem comprar há pelo menos (dias)', 'minDias', 'ex.: 30'),
      campo('Comprou nos últimos (dias)', 'maxDias', 'ex.: 365'),
      campo('Comprou pelo menos (vezes)', 'minVezes', 'ex.: 2'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e) => { f.comTelefone = e.target.checked; desenhar(); } }), 'Só com celular')),
    h('div', { class: 'barra-acao' }, contagem, h('button', { class: 'botao', type: 'button', onclick: copiar }, 'Copiar celulares'),
      h('button', { class: 'botao', type: 'button', onclick: exportar }, 'Baixar planilha')),
    h('div', { class: 'cartao rolagem' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Cliente'), h('th', { class: 'num' }, 'Vezes'), h('th', { class: 'num' }, 'Qtd.'), h('th', {}, 'Última'), h('th', {}, ''))),
      corpoTabela))));
}

// ───────────── RANKING ─────────────
async function telaRanking() {
  const f = { metrica: 'gasto', de: '', ate: '', min: '1' };
  const lista = h('div', { class: 'lista' });
  const carregar = debounce(async () => {
    trocar(lista, h('p', { class: 'suave' }, 'Calculando…'));
    try {
      const r = await rpc('radar_ranking', { p_metrica: f.metrica, p_de: f.de || null, p_ate: f.ate || null, p_min_compras: Number(f.min) || 1, p_lim: 50 });
      trocar(lista, r.length ? r.map((c, i) => h('button', { type: 'button', class: 'cartao cliente-item ranking', onclick: () => abrirCliente(c.id) },
        h('span', { class: 'posicao' }, i + 1),
        h('span', { class: 'cliente-nome' }, c.nome, c.fidelidade ? h('span', { class: 'etiqueta verde' }, 'Club') : null),
        h('span', { class: 'cliente-numeros' }, h('span', {}, 'gasto ', h('b', {}, reais(c.total))), h('span', {}, 'ticket ', h('b', {}, reais(c.ticket))),
          h('span', {}, h('b', {}, c.compras), ' compras'), h('span', { class: 'suave' }, 'última ', dataBR(c.ultima)))))
        : h('p', { class: 'suave' }, 'Ninguém neste filtro.'));
    } catch (e) { trocar(lista, h('p', { class: 'vermelho' }, e.message)); }
  }, 250);
  const seletor = h('div', { class: 'subabas' });
  const desenharSeletor = () => trocar(seletor, [['gasto', 'Maior gasto total'], ['ticket', 'Maior ticket médio']]
    .map(([k, t]) => h('button', { type: 'button', class: 'subaba' + (f.metrica === k ? ' ativa' : ''), onclick: () => { f.metrica = k; desenharSeletor(); carregar(); } }, t)));
  desenharSeletor();
  trocar(tela, h('section', {}, h('h1', {}, 'Quem mais compra?'),
    h('p', { class: 'suave' }, 'Só vendas concluídas. Clique no cliente para ver o que ele leva.'),
    seletor,
    h('div', { class: 'cartao filtros' },
      h('label', {}, 'De', h('input', { type: 'date', class: 'entrada', oninput: (e) => { f.de = e.target.value; carregar(); } })),
      h('label', {}, 'Até', h('input', { type: 'date', class: 'entrada', oninput: (e) => { f.ate = e.target.value; carregar(); } })),
      h('label', {}, 'Mínimo de compras', h('input', { type: 'number', min: '1', value: '1', class: 'entrada', oninput: (e) => { f.min = e.target.value; carregar(); } }))),
    lista));
  carregar();
}

// ───────────── navegação e login ─────────────
const ABAS = { clientes: telaClientes, produtos: telaProdutos, ranking: telaRanking };
function irPara(aba) {
  estado.aba = ABAS[aba] ? aba : 'clientes';
  document.querySelectorAll('#abas a').forEach((a) => a.classList.toggle('ativa', a.dataset.aba === estado.aba));
  if (location.search && estado.aba !== 'clientes') history.replaceState(null, '', location.pathname + '#' + estado.aba);
  ABAS[estado.aba]();
}

function telaLogin(mensagem = '') {
  document.getElementById('abas').hidden = true; situacaoEl.hidden = true;
  const email = h('input', { type: 'email', class: 'entrada', placeholder: 'E-mail', autocomplete: 'username' });
  const senha = h('input', { type: 'password', class: 'entrada', placeholder: 'Senha', autocomplete: 'current-password' });
  const erro = h('p', { class: 'vermelho' }, mensagem);
  const entrar = async (e) => {
    e.preventDefault();
    trocar(erro, 'Entrando…');
    const { error } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: senha.value });
    if (error) { trocar(erro, 'E-mail ou senha errados. É o mesmo login do Giftback Acker.'); return; }
    iniciarLogado();
  };
  trocar(tela, h('form', { class: 'cartao login', onsubmit: entrar },
    h('h1', {}, 'Entrar'), h('p', { class: 'suave' }, 'Use o mesmo e-mail e senha do Giftback Acker.'),
    email, senha, h('button', { class: 'botao principal', type: 'submit' }, 'Entrar'), erro));
  email.focus();
}

async function iniciarLogado() {
  const { data } = await supabase.auth.getSession();
  const usuario = document.getElementById('usuario');
  usuario.hidden = false;
  trocar(usuario, h('span', {}, data.session?.user?.email || ''), h('button', { class: 'link claro', type: 'button', onclick: async () => { await supabase.auth.signOut(); telaLogin(); } }, 'Sair'));
  const s = await mostrarSituacao();
  if (!s) { trocar(tela, h('div', { class: 'cartao' }, h('h1', {}, 'Sem acesso'), h('p', {}, 'Este e-mail não está na equipe do Giftback Acker.'))); return; }
  document.getElementById('abas').hidden = false;
  const pedido = pedidoDaUrl(location.search, location.hash);
  if (pedido.cliente) return abrirCliente(pedido.cliente, pedido);
  if (pedido.telefone) return abrirPorTelefone(pedido.telefone, pedido.nome);
  irPara((location.hash || '#clientes').slice(1));
}

async function iniciar() {
  const { createClient } = await import(SUPABASE_JS);
  supabase = createClient(SUPABASE_URL, SUPABASE_CHAVE_PUBLICA, { auth: { persistSession: true, autoRefreshToken: true } });
  window.addEventListener('hashchange', () => { if (!document.getElementById('abas').hidden) irPara(location.hash.slice(1)); });
  const { data } = await supabase.auth.getSession();
  if (!data.session) return telaLogin();
  return iniciarLogado();
}

iniciar().catch((e) => { console.error(e); trocar(tela, h('p', { class: 'vermelho' }, 'Não foi possível abrir o Radar: ' + (e.message || e))); });
