// tests/harness/reporter-estrito.mjs
//
// 06/10/2026 (A-74): reporter do node:test usado por `npm run test:estrito` (CI_ESTRITO=1). Imprime no stderr os
// testes PULADOS por falta de fixtures.json/aba (os "t.skip silenciosos" dos ~22 arquivos que ainda não usam
// fixtures-exigidas.mjs!exigirFixtures) e faz o processo terminar com erro se houver algum. Pulos legítimos por data
// ("fixture não tem hoje", "print do Gorila é de ...", "a planilha já não tem STR") não contam.
//
//   node --test --test-reporter=spec --test-reporter-destination=stdout \
//        --test-reporter=./tests/harness/reporter-estrito.mjs --test-reporter-destination=stderr
const DADO_AUSENTE = /fixtures\.json|aba "|sem fixtures/i;
const NAO_CONTA = /referencias-externas\.local\.json/i; // arquivo pessoal opcional

export function pulosPorDadoAusente(eventos) {
  return eventos.filter((e) => e.skip && DADO_AUSENTE.test(String(e.skip)) && !NAO_CONTA.test(String(e.skip)));
}

export default async function* reporterEstrito(source) {
  const pulos = [];
  for await (const ev of source) {
    if ((ev.type === 'test:pass' || ev.type === 'test:fail') && ev.data && ev.data.skip) {
      pulos.push({ nome: ev.data.name, skip: typeof ev.data.skip === 'string' ? ev.data.skip : '', arquivo: ev.data.file });
    }
  }
  const ruins = pulosPorDadoAusente(pulos.map((p) => ({ ...p, skip: p.skip })));
  if (ruins.length) {
    process.exitCode = 1;
    yield `\n[CI_ESTRITO] ${ruins.length} teste(s) pulado(s) por falta de dado da planilha (com CI_ESTRITO=1 isso reprova):\n`;
    for (const p of ruins) yield `  - ${p.nome} (${String(p.arquivo || '').split('/').slice(-2).join('/')}): ${p.skip}\n`;
  }
}
