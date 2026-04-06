import {
  labelForDay,
  labelForShift,
  labelForRole,
} from "./labels.js";

/**
 * Assistente geral da escala: dúvidas e sugestões com contexto real.
 * @param {string} coordinatorName
 * @param {string} periodLabel
 * @param {string} scheduleContext
 * @param {string} userMessage
 */
export function buildScheduleAssistantPrompt(
  coordinatorName,
  periodLabel,
  scheduleContext,
  userMessage
) {
  const ctx =
    scheduleContext && scheduleContext.trim().length > 0
      ? scheduleContext.trim()
      : "(Nenhum detalhe estruturado da escala foi enviado.)";

  return `Você é assistente de coordenação de voluntários em ministério infantil no Brasil — tom cordial, claro e prático (estilo assistente tipo "Tácia").

Quem está conversando: ${coordinatorName} (coordenador ou quem monta a escala; pode não ser um voluntário listado na tabela).
Período da escala na tela: ${periodLabel}

Dados atuais da escala no sistema (são a verdade sobre vagas vazias e duplicados; não invente outras vagas nem datas):
---
${ctx}
---

Pergunta ou pedido:
"${userMessage}"

Instruções:
- Responda em português do Brasil, texto plano, sem markdown.
- Responda diretamente à dúvida ou ao pedido.
- Para ajudar a concluir a escala, sugira passos concretos alinhados ao contexto (turnos, salas, comunicação com equipe, revisão de duplicados).
- Se mencionar vagas livres, use somente as que aparecem na amostra do contexto; deixe claro que a lista pode ser uma amostra.
- Seja breve quando couber (cerca de 3–7 frases); pode alongar um pouco se for um mini-plano.
- Não invente nomes de pessoas; não faça promessas legais ou financeiras.`;
}

/**
 * @param {string} volunteerName
 * @param {string[]} days
 * @param {string[]} shifts
 * @param {string[]} roles
 * @param {Array<{ day: string; shift: string; role: string; spotsLeft: number }>} matchedSlots
 */
export function buildPrompt(
  volunteerName,
  days,
  shifts,
  roles,
  matchedSlots
) {
  const slotsText = matchedSlots
    .map(
      (s) =>
        `- ${labelForDay(s.day)}, ${labelForShift(s.shift)}, ${labelForRole(s.role)} (${s.spotsLeft} vaga(s))`
    )
    .join("\n");

  return `Você é assistente de coordenação de voluntários de uma organização no Brasil.

Contexto: o sistema já filtrou vagas reais que respeitam as restrições do voluntário. Use APENAS as vagas listadas abaixo — não invente horários, dias ou funções que não apareçam.

Voluntário: ${volunteerName}
Dias que pode: ${days.map(labelForDay).join(", ")}
Turnos que pode: ${shifts.map(labelForShift).join(", ")}
Funções que aceita: ${roles.map(labelForRole).join(", ")}

Vagas compatíveis (lista fechada):
${slotsText}

Tarefa: escreva em português do Brasil, 3 a 5 frases curtas e cordiais:
1) Cumprimente pelo nome.
2) Resuma em linguagem natural as opções (sem repetir a lista inteira).
3) Se houver mais de uma opção, sugira um critério simples para escolher (ex.: priorizar dia mais próximo, ou função com mais vagas). Não escolha um slot específico como obrigatório — apenas oriente.
4) Não use markdown; texto plano.`;
}

/**
 * @param {string} volunteerName
 * @param {string[]} days
 * @param {string[]} shifts
 * @param {string[]} roles
 * @param {Array<{ day: string; shift: string; role: string }>} openCatalog
 */
export function buildNoMatchPrompt(
  volunteerName,
  days,
  shifts,
  roles,
  openCatalog
) {
  const catalogLines = openCatalog
    .map(
      (s) =>
        `- ${labelForDay(s.day)}, ${labelForShift(s.shift)}, ${labelForRole(s.role)}`
    )
    .join("\n");

  return `Você é assistente de coordenação de voluntários no Brasil.

O voluntário não encontrou nenhuma vaga porque a interseção entre os dias, turnos e funções que marcou não coincide com vagas abertas no sistema.

Voluntário: ${volunteerName}
Dias marcados: ${days.map(labelForDay).join(", ")}
Turnos marcados: ${shifts.map(labelForShift).join(", ")}
Funções marcadas: ${roles.map(labelForRole).join(", ")}

Catálogo REAL de vagas ainda abertas (não invente outras):
${catalogLines}

Tarefa: em português do Brasil, 3 a 5 frases curtas e empáticas:
1) Explique em uma linha que não há encaixe com a combinação atual.
2) Sugira 2 ou 3 ajustes concretos com base SÓ no catálogo acima (ex.: incluir um dia que apareça nas vagas, ou aceitar uma função que apareça junto dos turnos dele).
3) Não prometa vaga; não use markdown; texto plano.`;
}

/**
 * @param {string} volunteerName
 * @param {{ day: string; shift: string; role: string }} slot
 */
/**
 * @param {string} periodLabel ex.: "Maio de 2026"
 * @param {Array<{ name: string; placements: string[] }>} duplicates
 * @param {string[]} emptySlotLabels amostra de vagas ainda livres
 */
export function buildScheduleDuplicatesPrompt(
  periodLabel,
  duplicates,
  emptySlotLabels
) {
  const dupBlock = duplicates
    .map(
      (d) =>
        `Nome: "${d.name}"\n  Ocorrências:\n${d.placements.map((p) => `    - ${p}`).join("\n")}`
    )
    .join("\n\n");

  const emptyBlock =
    emptySlotLabels.length > 0
      ? emptySlotLabels.map((l) => `- ${l}`).join("\n")
      : "(Nenhuma vaga vazia listada — a escala pode estar completa.)";

  return `Você é assistente de coordenação de voluntários de ministério infantil no Brasil.

Período da escala: ${periodLabel}

PROBLEMA: o mesmo nome de voluntário foi colocado em mais de um lugar na tabela (pode ser engano ou pessoa que realmente serve em dois turnos no mesmo dia — o coordenador precisa decidir).

Duplicidades detectadas pelo sistema:
${dupBlock}

Amostra de vagas AINDA LIVRES neste período (use só estas como opções reais de remanejamento; não invente datas ou turnos):
${emptyBlock}

Tarefa: responda em português do Brasil, texto plano, sem markdown:
1) Explique em 1–2 frases que há nomes repetidos e por que isso merece revisão.
2) Para cada nome repetido, sugira de forma prática: ou confirmar se a duplicidade é intencional, ou mover uma das ocorrências para uma das vagas livres listadas (cite 2 ou 3 opções concretas da lista de vagas livres quando fizer sentido).
3) Tom cordial e objetivo; não acuse o usuário; não prometa que a vaga existe além da lista fornecida.`;
}

export function buildSlotConfirmPrompt(volunteerName, slot) {
  return `Você é assistente de coordenação de voluntários no Brasil.

O voluntário acabou de escolher uma vaga no sistema.

Nome: ${volunteerName}
Vaga: ${labelForDay(slot.day)}, ${labelForShift(slot.shift)}, ${labelForRole(slot.role)}

Tarefa: escreva em português do Brasil, 2 a 4 frases curtas, cordiais e claras:
1) Confirme a escolha usando o primeiro nome se for óbvio (ex.: "Maria" de "Maria Silva"), senão use o nome completo.
2) Lembre de chegar no horário e, se aplicável, procurar a equipe de recepção ou coordenação.
3) Tom positivo, sem markdown, texto plano.`;
}
