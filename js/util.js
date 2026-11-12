// Funções puras (testadas em tests/util.test.mjs).

export function soDigitos(v) { return String(v ?? '').replace(/\D/g, ''); }

/** (47) 9.9932-8511, igual ao Giftback. Fixo: (47) 3348-3186. */
export function formatarTelefone(tel) {
  const d = soDigitos(tel).replace(/^0+/, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d[2]}.${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d || '';
}

/** Número para o link do WhatsApp (55 + DDD + número), ou null. */
export function numeroWhatsapp(tel) {
  const d = soDigitos(tel).replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) return '55' + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return null;
}

export function linkWhatsapp(tel, texto = '') {
  const n = numeroWhatsapp(tel);
  if (!n) return null;
  return `https://web.whatsapp.com/send?phone=${n}${texto ? '&text=' + encodeURIComponent(texto) : ''}`;
}

export function reais(v) {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** '2026-07-01' -> '01/07/2026' (sem fuso: a data já é do dia da venda). */
export function dataBR(iso) {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

export function haDias(dias) {
  if (dias === null || dias === undefined) return '';
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 60) return `há ${dias} dias`;
  const meses = Math.round(dias / 30);
  return meses < 24 ? `há ${meses} meses` : `há ${Math.round(dias / 365)} anos`;
}

/** Quantidade: 0,052 kg / 2 un. Produtos a granel vêm em kg com 3 casas. */
export function quantidade(q) {
  const n = Number(q || 0);
  return Number.isInteger(n) ? String(n) : n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

export function primeiroNome(nome) {
  const p = String(nome || '').trim().split(/\s+/)[0] || '';
  return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : '';
}

/** Mensagem de recompra com os produtos escolhidos. */
export function mensagemRecompra(nome, produtos) {
  const nomes = produtos.map((p) => String(p.nome || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const lista = nomes.length <= 1 ? (nomes[0] || '') : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
  const ola = primeiroNome(nome) ? `Olá, ${primeiroNome(nome)}!` : 'Olá!';
  return `${ola} Aqui é da NatuBrava 🌿 Vimos que você costuma levar ${lista}. `
    + 'Já está acabando por aí? Temos à sua espera aqui na loja. Se quiser, separamos para você!';
}

/** CSV com ; (Excel em português) e BOM. */
export function csv(linhas, colunas) {
  const esc = (v) => {
    const t = v === null || v === undefined ? '' : String(v);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '﻿' + [colunas.map((c) => esc(c[0])).join(';'),
    ...linhas.map((l) => colunas.map((c) => esc(typeof c[1] === 'function' ? c[1](l) : l[c[1]])).join(';'))].join('\r\n');
}

/** Lê ?telefone=&nome=&cliente= do endereço (link vindo do Giftback). */
// Aceita "?cliente=..." ou "#cliente=..." (o Giftback usa # para o telefone/nome não irem para o servidor).
export function pedidoDaUrl(search, hash) {
  const p = new URLSearchParams(search || '');
  for (const [k, v] of new URLSearchParams(String(hash || '').replace(/^#/, ''))) if (!p.has(k)) p.set(k, v);
  return {
    telefone: soDigitos(p.get('telefone')),
    nome: (p.get('nome') || '').trim(),
    cliente: (p.get('cliente') || '').trim(),
  };
}

export function filtrarCompradores(lista, f) {
  const n = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  const minDias = n(f.minDias), maxDias = n(f.maxDias), minVezes = n(f.minVezes);
  return lista.filter((c) => (minDias === null || c.dias >= minDias)
    && (maxDias === null || c.dias <= maxDias)
    && (minVezes === null || c.vezes >= minVezes)
    && (!f.comTelefone || !!numeroWhatsapp(c.telefone)));
}
