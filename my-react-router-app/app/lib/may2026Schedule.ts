import type { ExtraRoleId, RoleId, ShiftId } from "./volunteer-scheduling";

/** Domingos de maio de 2026 (data local). */
export const MAY_2026_SUNDAYS: readonly Date[] = [
  new Date(2026, 4, 3),
  new Date(2026, 4, 10),
  new Date(2026, 4, 17),
  new Date(2026, 4, 24),
  new Date(2026, 4, 31),
];

export type CalendarShiftId = "manha" | "tarde" | "noite";

export const CALENDAR_SHIFT_ORDER: readonly CalendarShiftId[] = [
  "manha",
  "tarde",
  "noite",
];

export const CALENDAR_SHIFT_LABELS: Record<CalendarShiftId, string> = {
  manha: "MANHÃ",
  tarde: "TARDE",
  noite: "NOITE",
};

export function formatDateBr(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

export function dateKeyLocal(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function scheduleCellKey(
  shiftId: CalendarShiftId,
  dateKey: string,
  rowKey: string,
  part: string
): string {
  return `${shiftId}:${dateKey}:${rowKey}:${part}`;
}

const ROW_LABELS: Record<string, string> = {
  facilitador: "FACILITADOR",
  kids: "KIDS",
  super_kids: "SUPER KIDS",
  juniores: "JUNIORES",
};

export type SlotRoleKind = "facilitador" | "titular" | "auxiliar";

export interface SlotDescriptor {
  key: string;
  shiftId: CalendarShiftId;
  dateKey: string;
  rowKey: string;
  part: string;
  roleKind: SlotRoleKind;
}

function auxCountForRow(rowKey: string): number {
  return rowKey === "juniores" ? 2 : 3;
}

/** Todas as células da grade (ordem: turno → data → linha). */
export function enumerateScheduleSlots(): SlotDescriptor[] {
  const out: SlotDescriptor[] = [];
  for (const shiftId of CALENDAR_SHIFT_ORDER) {
    for (const d of MAY_2026_SUNDAYS) {
      const dk = dateKeyLocal(d);
      out.push({
        key: scheduleCellKey(shiftId, dk, "facilitador", "fac"),
        shiftId,
        dateKey: dk,
        rowKey: "facilitador",
        part: "fac",
        roleKind: "facilitador",
      });
      for (const rowKey of ["kids", "super_kids", "juniores"] as const) {
        out.push({
          key: scheduleCellKey(shiftId, dk, rowKey, "tit"),
          shiftId,
          dateKey: dk,
          rowKey,
          part: "tit",
          roleKind: "titular",
        });
        const n = auxCountForRow(rowKey);
        for (let i = 0; i < n; i++) {
          out.push({
            key: scheduleCellKey(shiftId, dk, rowKey, `aux${i}`),
            shiftId,
            dateKey: dk,
            rowKey,
            part: `aux${i}`,
            roleKind: "auxiliar",
          });
        }
      }
    }
  }
  return out;
}

export function isCellEmpty(
  grid: Record<string, string>,
  key: string
): boolean {
  const v = grid[key];
  return v === undefined || String(v).trim() === "";
}

export function formatSlotHuman(
  d: Date,
  desc: Pick<SlotDescriptor, "shiftId" | "rowKey" | "roleKind" | "part">
): string {
  const shift = CALENDAR_SHIFT_LABELS[desc.shiftId];
  const dom = `Dom ${formatDateBr(d)}`;
  const sala = ROW_LABELS[desc.rowKey] ?? desc.rowKey;
  if (desc.roleKind === "facilitador") return `${shift} · ${dom} · ${sala}`;
  if (desc.roleKind === "titular") return `${shift} · ${dom} · ${sala} · Titular`;
  const m = /^aux(\d+)$/.exec(desc.part);
  const n = m ? Number(m[1]) + 1 : 1;
  return `${shift} · ${dom} · ${sala} · Auxiliar ${n}`;
}

export function dateFromKey(dateKey: string): Date | null {
  const m = /^(\d+)-(\d+)-(\d+)$/.exec(dateKey);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const day = Number(m[3]);
  return new Date(y, mo, day);
}

export function formatDescriptorLine(s: SlotDescriptor): string {
  const d = dateFromKey(s.dateKey);
  if (!d) return s.key;
  return formatSlotHuman(d, s);
}

export function formatSlotDescriptor(gridKey: string): string {
  const parts = gridKey.split(":");
  if (parts.length < 4) return gridKey;
  const [shiftId, dateKey, rowKey, part] = parts as [
    CalendarShiftId,
    string,
    string,
    string,
  ];
  const d = dateFromKey(dateKey);
  if (!d || !CALENDAR_SHIFT_LABELS[shiftId]) return gridKey;
  const roleKind: SlotRoleKind =
    part === "fac"
      ? "facilitador"
      : part === "tit"
        ? "titular"
        : "auxiliar";
  return formatSlotHuman(d, { shiftId, rowKey, part, roleKind });
}

export function listEmptySlots(
  grid: Record<string, string>
): SlotDescriptor[] {
  return enumerateScheduleSlots().filter((s) => isCellEmpty(grid, s.key));
}

export const SCHEDULE_GRID_STORAGE_KEY = "volunteer-schedule-may-2026-grid";

export function loadScheduleGridFromStorage(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SCHEDULE_GRID_STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object" || Array.isArray(p)) return {};
    const o = p as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveScheduleGridToStorage(grid: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SCHEDULE_GRID_STORAGE_KEY, JSON.stringify(grid));
  } catch {
    /* ignore quota */
  }
}

const ROLE_TRY_ORDER: readonly RoleId[] = [
  "facilitador",
  "titular",
  "auxiliar",
];

export interface PlacementConstraints {
  shifts: ShiftId[];
  roles: RoleId[];
  extraRoles: ExtraRoleId[];
}

/**
 * Primeira vaga livre que combina com turnos/função/salas escolhidos.
 * Considera a grade acumulada (nomes já preenchidos ocupam a vaga).
 */
export function findFirstMatchingEmptySlot(
  grid: Record<string, string>,
  constraints: PlacementConstraints
): { key: string; label: string } | null {
  const shiftSet = new Set(
    constraints.shifts.filter((s): s is CalendarShiftId =>
      (CALENDAR_SHIFT_ORDER as readonly string[]).includes(s)
    )
  );
  if (shiftSet.size === 0) return null;

  const dates = [...MAY_2026_SUNDAYS];

  for (const d of dates) {
    const dk = dateKeyLocal(d);
    for (const shiftId of CALENDAR_SHIFT_ORDER) {
      if (!shiftSet.has(shiftId)) continue;

      for (const role of ROLE_TRY_ORDER) {
        if (!constraints.roles.includes(role)) continue;

        if (role === "facilitador") {
          const key = scheduleCellKey(shiftId, dk, "facilitador", "fac");
          if (isCellEmpty(grid, key)) {
            return {
              key,
              label: formatSlotHuman(d, {
                shiftId,
                rowKey: "facilitador",
                part: "fac",
                roleKind: "facilitador",
              }),
            };
          }
          continue;
        }

        const rooms =
          constraints.extraRoles.length > 0
            ? constraints.extraRoles
            : ([] as ExtraRoleId[]);

        if (rooms.length === 0) continue;

        if (role === "titular") {
          for (const room of rooms) {
            const key = scheduleCellKey(shiftId, dk, room, "tit");
            if (isCellEmpty(grid, key)) {
              return {
                key,
                label: formatSlotHuman(d, {
                  shiftId,
                  rowKey: room,
                  part: "tit",
                  roleKind: "titular",
                }),
              };
            }
          }
          continue;
        }

        /* auxiliar */
        for (const room of rooms) {
          const n = auxCountForRow(room);
          for (let i = 0; i < n; i++) {
            const key = scheduleCellKey(shiftId, dk, room, `aux${i}`);
            if (isCellEmpty(grid, key)) {
              return {
                key,
                label: formatSlotHuman(d, {
                  shiftId,
                  rowKey: room,
                  part: `aux${i}`,
                  roleKind: "auxiliar",
                }),
              };
            }
          }
        }
      }
    }
  }

  return null;
}

/** Vagas livres que ainda respeitam os mesmos filtros (para orientar o usuário). */
export function listEmptySlotsMatchingFilters(
  grid: Record<string, string>,
  constraints: PlacementConstraints
): SlotDescriptor[] {
  const shiftSet = new Set(
    constraints.shifts.filter((s): s is CalendarShiftId =>
      (CALENDAR_SHIFT_ORDER as readonly string[]).includes(s)
    )
  );
  const empty = listEmptySlots(grid);
  return empty.filter((s) => {
    if (!shiftSet.has(s.shiftId)) return false;
    if (s.roleKind === "facilitador") {
      return constraints.roles.includes("facilitador");
    }
    if (s.roleKind === "titular") {
      return (
        constraints.roles.includes("titular") &&
        constraints.extraRoles.includes(s.rowKey as ExtraRoleId)
      );
    }
    return (
      constraints.roles.includes("auxiliar") &&
      constraints.extraRoles.includes(s.rowKey as ExtraRoleId)
    );
  });
}
