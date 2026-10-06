// tests/harness/avaliador-formula.mjs
//
// 06/10/2026: avaliador MÍNIMO de fórmulas do Google Sheets (só o que o FundamentosPlanilha.gs escreve) pra provar a
// LÓGICA das fórmulas (preferência pelo resumo, guarda de plausibilidade, "nunca #DIV/0!"), já que a planilha falsa
// (planilha-falsa.mjs) guarda a fórmula mas não calcula. Suporta: números, textos, referências (A1, $A:$G, $1:$11020,
// 'aba'!...), + - * / comparações, e as funções IFERROR, LET, IF, AND, OR, N, ISNUMBER, VLOOKUP (busca exata) e
// GOOGLEFINANCE (stub informado pelo teste). Separador ";" como na planilha pt-BR. Semântica seguida de propósito como
// a do Sheets: AND/OR avaliam TODOS os argumentos (um erro em qualquer um propaga), "" > número é verdadeiro,
// aritmética com texto dá #VALUE!, N(texto) = 0, dividir por zero dá #DIV/0!.

export class ErroFormula extends Error {
  constructor(codigo) { super(codigo); this.codigo = codigo; }
}
const erro = (c) => { throw new ErroFormula(c); };

function colIdx(letras) { let n = 0; for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }

function tokenizar(src) {
  const re = /\s*(?:('(?:[^']|'')*'!)|("(?:[^"]|"")*")|(\d+(?:\.\d+)?)|(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?|\$[A-Z]{1,3}:\$[A-Z]{1,3}|\$\d+:\$\d+)|([A-Za-z_][A-Za-z_0-9]*)|(>=|<=|<>|[-+*/()<>=;]))/gy;
  const toks = [];
  let m;
  re.lastIndex = 0;
  while (re.lastIndex < src.length) {
    const ini = re.lastIndex;
    m = re.exec(src);
    if (!m) { if (/^\s*$/.test(src.slice(ini))) break; throw new Error(`token inesperado em: ${src.slice(ini, ini + 20)}`); }
    if (m[1]) toks.push({ t: 'aba', v: m[1].slice(1, -2).replace(/''/g, "'") });
    else if (m[2]) toks.push({ t: 'str', v: m[2].slice(1, -1).replace(/""/g, '"') });
    else if (m[3]) toks.push({ t: 'num', v: Number(m[3]) });
    else if (m[4]) toks.push({ t: 'ref', v: m[4] });
    else if (m[5]) toks.push({ t: 'id', v: m[5] });
    else toks.push({ t: 'op', v: m[6] });
  }
  return toks;
}

function parsear(toks) {
  let i = 0;
  const olha = () => toks[i];
  const come = (v) => { const x = toks[i++]; if (v != null && (!x || x.v !== v)) throw new Error(`esperava ${v}`); return x; };
  function expr() {
    let a = soma();
    while (olha() && olha().t === 'op' && ['>=', '<=', '<>', '>', '<', '='].includes(olha().v)) { const op = come().v; a = { k: 'cmp', op, a, b: soma() }; }
    return a;
  }
  function soma() {
    let a = prod();
    while (olha() && olha().t === 'op' && ['+', '-'].includes(olha().v)) { const op = come().v; a = { k: 'bin', op, a, b: prod() }; }
    return a;
  }
  function prod() {
    let a = unario();
    while (olha() && olha().t === 'op' && ['*', '/'].includes(olha().v)) { const op = come().v; a = { k: 'bin', op, a, b: unario() }; }
    return a;
  }
  function unario() {
    if (olha() && olha().t === 'op' && olha().v === '-') { come(); return { k: 'bin', op: '-', a: { k: 'lit', v: 0 }, b: unario() }; }
    return primario();
  }
  function primario() {
    const x = come();
    if (x.t === 'num' || x.t === 'str') return { k: 'lit', v: x.v };
    if (x.t === 'aba') { const r = come(); return { k: 'ref', aba: x.v, ref: r.v }; }
    if (x.t === 'ref') return { k: 'ref', aba: null, ref: x.v };
    if (x.t === 'op' && x.v === '(') { const e = expr(); come(')'); return e; }
    if (x.t === 'id') {
      if (olha() && olha().v === '(') {
        come('(');
        const args = [];
        if (!(olha() && olha().v === ')')) { args.push(expr()); while (olha() && olha().v === ';') { come(';'); args.push(expr()); } }
        come(')');
        return { k: 'fn', nome: x.v.toUpperCase(), args };
      }
      return { k: 'var', nome: x.v };
    }
    throw new Error(`inesperado: ${JSON.stringify(x)}`);
  }
  const arv = expr();
  if (i < toks.length) throw new Error('sobrou texto na fórmula');
  return arv;
}

const ehNum = (v) => typeof v === 'number';
function aNumero(v) { if (ehNum(v)) return v; if (v === '' || v == null) return 0; erro('#VALUE!'); }
function comparar(op, a, b) {
  const rank = (v) => (ehNum(v) ? 0 : typeof v === 'string' ? 1 : 2);
  let c;
  if (rank(a) !== rank(b)) c = rank(a) - rank(b); else c = a < b ? -1 : a > b ? 1 : 0;
  return { '>=': c >= 0, '<=': c <= 0, '>': c > 0, '<': c < 0, '=': c === 0, '<>': c !== 0 }[op];
}

/**
 * avaliarFormula(formula, { aba, linha?, abas: { nome: AbaFalsa }, google: (ticker, atributo) => número|erro })
 * `aba` = aba corrente (referências sem nome de aba). Devolve o valor ('' = vazio) ou lança ErroFormula.
 */
export function avaliarFormula(formula, ctx) {
  const arv = parsear(tokenizar(String(formula).replace(/^=/, '')));
  const celula = (aba, r, c) => { const x = aba.peek(r, c); return x.v === undefined || x.v === null ? '' : x.v; };
  const resolverAba = (nome) => (nome ? ctx.abas[nome] || erro('#REF!') : ctx.aba);
  const ev = (n, env) => {
    switch (n.k) {
      case 'lit': return n.v;
      case 'var': { if (!(n.nome in env)) erro('#NAME?'); return env[n.nome]; }
      case 'ref': {
        const m = n.ref.replace(/\$/g, '').match(/^([A-Z]+)(\d+)$/);
        if (!m) return { intervalo: n.ref.replace(/\$/g, ''), aba: resolverAba(n.aba) };
        return celula(resolverAba(n.aba), Number(m[2]), colIdx(m[1]));
      }
      case 'bin': { const a = aNumero(ev(n.a, env)); const b = aNumero(ev(n.b, env)); if (n.op === '/' && b === 0) erro('#DIV/0!'); return { '+': a + b, '-': a - b, '*': a * b, '/': a / b }[n.op]; }
      case 'cmp': return comparar(n.op, ev(n.a, env), ev(n.b, env));
      case 'fn': return fn(n, env);
      default: throw new Error(`nó ${n.k}`);
    }
  };
  function fn(n, env) {
    const a = n.args;
    switch (n.nome) {
      case 'IFERROR': { try { return ev(a[0], env); } catch (e) { if (e instanceof ErroFormula) return ev(a[1], env); throw e; } }
      case 'IF': { const c = ev(a[0], env); if (typeof c !== 'boolean') erro('#VALUE!'); return c ? ev(a[1], env) : (a[2] ? ev(a[2], env) : false); }
      case 'AND': { const v = a.map((x) => ev(x, env)); return v.every((x) => x === true); }
      case 'OR': { const v = a.map((x) => ev(x, env)); return v.some((x) => x === true); }
      case 'N': { const v = ev(a[0], env); return ehNum(v) ? v : (v === true ? 1 : 0); }
      case 'ISNUMBER': return ehNum(ev(a[0], env));
      case 'LET': {
        const novo = { ...env };
        for (let j = 0; j < a.length - 1; j += 2) novo[a[j].nome] = ev(a[j + 1], novo);
        return ev(a[a.length - 1], novo);
      }
      case 'VLOOKUP': {
        const chave = ev(a[0], env); const rg = ev(a[1], env); const col = ev(a[2], env);
        const m = rg.intervalo.match(/^([A-Z]+):([A-Z]+)$/) || rg.intervalo.match(/^(\d+):(\d+)$/);
        const aba = rg.aba;
        const ultima = aba.getLastRow();
        let c0 = 1;
        if (/^[A-Z]+$/.test(m[1])) c0 = colIdx(m[1]);
        const [r0, r1] = /^\d+$/.test(m[1]) ? [Number(m[1]), Math.min(Number(m[2]), ultima)] : [1, ultima];
        for (let r = r0; r <= r1; r++) {
          const k = celula(aba, r, c0);
          if (k !== '' && k === chave) return celula(aba, r, c0 + col - 1);
        }
        return erro('#N/A');
      }
      case 'GOOGLEFINANCE': {
        const v = ctx.google ? ctx.google(ev(a[0], env), ev(a[1], env)) : erro('#N/A');
        if (v === 'erro' || v == null) erro('#N/A');
        return v;
      }
      default: return erro('#NAME?');
    }
  }
  return ev(arv, {});
}
