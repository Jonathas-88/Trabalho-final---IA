export const DAYS = [
  { id: "seg", label: "Segunda" },
  { id: "ter", label: "Terça" },
  { id: "qua", label: "Quarta" },
  { id: "qui", label: "Quinta" },
  { id: "sex", label: "Sexta" },
  { id: "sab", label: "Sábado" },
  { id: "dom", label: "Domingo" },
] as const;

export type DayId = (typeof DAYS)[number]["id"];

export const SHIFTS = [
  { id: "manha", label: "Culto manhã (10h-11:30h)" },
  { id: "tarde", label: "Culto tarde (13h-17h)" },
  { id: "noite", label: "Culto noite (18h-22h)" },
] as const;

export type ShiftId = (typeof SHIFTS)[number]["id"];

export const ROLES = [
  { id: "facilitador", label: "Facilitador" },
  { id: "titular", label: "Titular" },
  { id: "auxiliar", label: "Auxiliar" },
] as const;

export type RoleId = (typeof ROLES)[number]["id"];

export interface ScheduleSlot {
  id: string;
  day: DayId;
  shift: ShiftId;
  role: RoleId;
  extraRole: ExtraRoleId;
  spotsLeft: number;
}

export const EXTRA_ROLES = [
  { id: "kids", label: "Kids" },
  { id: "super_kids", label: "Super Kids" },
  { id: "juniores", label: "Juniores" },
] as const;

export type ExtraRoleId = (typeof EXTRA_ROLES)[number]["id"];

/** Vagas exemplo — substitua por dados reais ou API depois */
export const MOCK_SLOTS: ScheduleSlot[] = [
  {id: "1", day: "seg", shift: "manha", role: "facilitador", extraRole: "kids", spotsLeft: 2,},
  { id: "2", day: "seg", shift: "tarde", role: "titular", extraRole: "super_kids", spotsLeft: 3 },
  { id: "3", day: "ter", shift: "manha", role: "auxiliar", extraRole: "juniores", spotsLeft: 1 },
  { id: "4", day: "ter", shift: "noite", role: "facilitador", extraRole: "kids", spotsLeft: 2 },
  { id: "5", day: "qua", shift: "tarde", role: "titular", extraRole: "super_kids", spotsLeft: 2 },
  { id: "6", day: "qui", shift: "manha", role: "auxiliar", extraRole: "juniores", spotsLeft: 1 },
  { id: "7", day: "qui", shift: "noite", role: "facilitador", extraRole: "kids", spotsLeft: 4 },
  { id: "8", day: "sex", shift: "tarde", role: "titular", extraRole: "super_kids", spotsLeft: 2 },
  { id: "9", day: "sab", shift: "manha", role: "auxiliar", extraRole: "juniores", spotsLeft: 3 },
  { id: "10", day: "sab", shift: "tarde", role: "facilitador", extraRole: "kids", spotsLeft: 1 },
  { id: "11", day: "dom", shift: "manha", role: "titular", extraRole: "super_kids", spotsLeft: 2 },
  { id: "12", day: "dom", shift: "noite", role: "auxiliar", extraRole: "juniores", spotsLeft: 2 },
];



const resultado = matchExtraSlots({
  name: "Jonathas",
  days: ["seg", "ter", "qua", "qui", "sex", "sab", "dom"],
  shifts: ["manha", "tarde", "noite"],
  roles: ["facilitador", "titular", "auxiliar"],
  extraRoles: ["kids", "super_kids", "juniores"],
});

export function matchExtraSlots(
  constraints: VolunteerConstraints
): ScheduleSlot[] {
  return MOCK_SLOTS.filter(
    (s) =>
      constraints.days.includes(s.day) &&
      constraints.shifts.includes(s.shift) &&
      constraints.roles.includes(s.role) &&
      constraints.extraRoles.includes(s.extraRole) && // 👈 FILTRO NOVO
      s.spotsLeft > 0
  );
}

export interface VolunteerConstraints {
  name: string;
  days: DayId[];
  shifts: ShiftId[];
  roles: RoleId[];
  extraRoles: ExtraRoleId[];
}

export function labelForDay(id: DayId): string {
  return DAYS.find((d) => d.id === id)?.label ?? id;
}

export function labelForShift(id: ShiftId): string {
  return SHIFTS.find((s) => s.id === id)?.label ?? id;
}

export function labelForRole(id: RoleId): string {
  return ROLES.find((r) => r.id === id)?.label ?? id;
}

/**
 * Retorna vagas que respeitam dia, turno e função escolhidos pelo voluntário
 * e ainda têm vaga disponível.
 */
export function matchSlots(
  constraints: VolunteerConstraints,
  slots: ScheduleSlot[] = MOCK_SLOTS
): ScheduleSlot[] {
  const { days, shifts, roles } = constraints;
  if (!days.length || !shifts.length || !roles.length) return [];

  return slots.filter(
    (s) =>
      days.includes(s.day) &&
      shifts.includes(s.shift) &&
      roles.includes(s.role) &&
      s.spotsLeft > 0
  );
}

/** Tuplas únicas dia/turno/função com vaga aberta (para dicas de IA sem vazar ids internos). */
export function openSlotCatalog(
  slots: ScheduleSlot[] = MOCK_SLOTS
): Array<{ day: DayId; shift: ShiftId; role: RoleId }> {
  const seen = new Set<string>();
  const out: Array<{ day: DayId; shift: ShiftId; role: RoleId }> = [];
  for (const s of slots) {
    if (s.spotsLeft <= 0) continue;
    const key = `${s.day}|${s.shift}|${s.role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ day: s.day, shift: s.shift, role: s.role });
  }
  return out;
}

/** Agrupa resultados por dia para exibir “direcionamento” claro */
export function groupByDay(slots: ScheduleSlot[]): Map<DayId, ScheduleSlot[]> {
  const map = new Map<DayId, ScheduleSlot[]>();
  for (const s of slots) {
    const list = map.get(s.day) ?? [];
    list.push(s);
    map.set(s.day, list);
  }
  return map;
}

