/** Mesmos ids/rótulos do front (app/lib/volunteer-scheduling.ts) */

const DAY_LABELS = {
  seg: "Segunda",
  ter: "Terça",
  qua: "Quarta",
  qui: "Quinta",
  sex: "Sexta",
  sab: "Sábado",
  dom: "Domingo",
};

const SHIFT_LABELS = {
  manha: "Manhã (8h–12h)",
  tarde: "Tarde (13h–17h)",
  noite: "Noite (18h–22h)",
};

const ROLE_LABELS = {
  recepcao: "Recepção",
  apoio: "Apoio geral",
  som: "Som / multimídia",
  cafeteria: "Cafeteria",
  infantil: "Ministério infantil",
};

export function labelForDay(id) {
  return DAY_LABELS[id] ?? id;
}

export function labelForShift(id) {
  return SHIFT_LABELS[id] ?? id;
}

export function labelForRole(id) {
  return ROLE_LABELS[id] ?? id;
}
