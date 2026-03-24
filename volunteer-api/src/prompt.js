import {
  labelForDay,
  labelForShift,
  labelForRole,
} from "./labels.js";

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
