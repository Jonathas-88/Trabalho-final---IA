import type { ExtraRoleId, RoleId, ShiftId } from "./volunteer-scheduling";

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

/** Retorna todos os domingos do mês (ano, mês 0–11, data local). */
export function sundaysInMonth(year: number, monthIndex0: number): Date[] {
  const out: Date[] = [];
  const last = new Date(year, monthIndex0 + 1, 0).getDate();
  for (let day = 1; day <= last; day++) {
    const d = new Date(year, monthIndex0, day);
    if (d.getDay() === 0) out.push(d);
  }
  return out;
}

export function formatDateBr(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

export function dateKeyLocal(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function periodKey(year: number, month1to12: number): string {
  return `${year}-${month1to12}`;
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

export function enumerateScheduleSlots(
  sundays: readonly Date[]
): SlotDescriptor[] {
  const out: SlotDescriptor[] = [];
  for (const shiftId of CALENDAR_SHIFT_ORDER) {
    for (const d of sundays) {
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
  grid: Record<string, string>,
  sundays: readonly Date[]
): SlotDescriptor[] {
  return enumerateScheduleSlots(sundays).filter((s) =>
    isCellEmpty(grid, s.key)
  );
}

const OLD_FLAT_STORAGE_KEY = "volunteer-schedule-may-2026-grid";
export const SCHEDULE_STORAGE_KEY_V2 = "volunteer-schedule-v2";

export type ScheduleStoreV2 = {
  version: 2;
  year: number;
  month: number;
  grids: Record<string, Record<string, string>>;
};

const DEFAULT_YEAR = 2026;
const DEFAULT_MONTH = 5;

function emptyGrids(): Record<string, Record<string, string>> {
  return {};
}

export function loadScheduleStore(): ScheduleStoreV2 {
  if (typeof window === "undefined") {
    return {
      version: 2,
      year: DEFAULT_YEAR,
      month: DEFAULT_MONTH,
      grids: emptyGrids(),
    };
  }
  try {
    const rawV2 = localStorage.getItem(SCHEDULE_STORAGE_KEY_V2);
    if (rawV2) {
      const p = JSON.parse(rawV2) as unknown;
      if (
        p &&
        typeof p === "object" &&
        !Array.isArray(p) &&
        (p as ScheduleStoreV2).version === 2
      ) {
        const o = p as ScheduleStoreV2;
        const grids =
          o.grids && typeof o.grids === "object" && !Array.isArray(o.grids)
            ? { ...o.grids }
            : emptyGrids();
        for (const k of Object.keys(grids)) {
          const g = grids[k];
          if (!g || typeof g !== "object" || Array.isArray(g)) {
            delete grids[k];
            continue;
          }
          const clean: Record<string, string> = {};
          for (const [ck, cv] of Object.entries(g)) {
            if (typeof cv === "string") clean[ck] = cv;
          }
          grids[k] = clean;
        }
        return {
          version: 2,
          year: Number.isFinite(o.year) ? o.year : DEFAULT_YEAR,
          month:
            Number.isFinite(o.month) && o.month >= 1 && o.month <= 12
              ? o.month
              : DEFAULT_MONTH,
          grids,
        };
      }
    }

    const rawOld = localStorage.getItem(OLD_FLAT_STORAGE_KEY);
    if (rawOld) {
      const p = JSON.parse(rawOld) as unknown;
      const grid: Record<string, string> = {};
      if (p && typeof p === "object" && !Array.isArray(p)) {
        for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
          if (typeof v === "string") grid[k] = v;
        }
      }
      const pk = periodKey(DEFAULT_YEAR, DEFAULT_MONTH);
      return {
        version: 2,
        year: DEFAULT_YEAR,
        month: DEFAULT_MONTH,
        grids: Object.keys(grid).length > 0 ? { [pk]: grid } : emptyGrids(),
      };
    }
  } catch {
    /* ignore */
  }
  return {
    version: 2,
    year: DEFAULT_YEAR,
    month: DEFAULT_MONTH,
    grids: emptyGrids(),
  };
}

export function saveScheduleStore(store: ScheduleStoreV2): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SCHEDULE_STORAGE_KEY_V2, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

/** Extrai objeto `grid` de export JSON (vários formatos). */
export function parseImportedGrid(
  data: unknown
): Record<string, string> | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  let raw: unknown = o.grid;
  if (!raw && o.grids && typeof o.grids === "object") {
    const g = o.grids as Record<string, unknown>;
    const keys = Object.keys(g);
    if (keys.length === 1 && g[keys[0]] && typeof g[keys[0]] === "object") {
      raw = g[keys[0]];
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    const keys = Object.keys(o);
    if (
      keys.length > 0 &&
      keys.every((k) => k.includes(":")) &&
      keys.every((k) => typeof o[k] === "string")
    ) {
      raw = o;
    } else return null;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
    else if (typeof v === "string") out[k] = "";
  }
  return Object.keys(out).length > 0 ? out : null;
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

export function findFirstMatchingEmptySlot(
  grid: Record<string, string>,
  constraints: PlacementConstraints,
  sundays: readonly Date[]
): { key: string; label: string } | null {
  const shiftSet = new Set(
    constraints.shifts.filter((s): s is CalendarShiftId =>
      (CALENDAR_SHIFT_ORDER as readonly string[]).includes(s)
    )
  );
  if (shiftSet.size === 0) return null;

  for (const d of sundays) {
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

/** Nome repetido em mais de uma célula (comparação sem diferenciar maiúsculas e espaços). */
export function findDuplicateNameAssignments(
  grid: Record<string, string>
): Array<{
  normalized: string;
  displayName: string;
  cellKeys: string[];
}> {
  const groups = new Map<string, { display: string; keys: string[] }>();
  for (const [cellKey, raw] of Object.entries(grid)) {
    const v = String(raw).trim();
    if (!v) continue;
    const normalized = v.toLowerCase().replace(/\s+/g, " ").trim();
    const g = groups.get(normalized);
    if (!g) {
      groups.set(normalized, { display: v, keys: [cellKey] });
    } else {
      g.keys.push(cellKey);
      if (v.length > g.display.length) g.display = v;
    }
  }
  return [...groups.entries()]
    .filter(([, g]) => g.keys.length > 1)
    .map(([normKey, g]) => ({
      normalized: normKey,
      displayName: g.display,
      cellKeys: g.keys,
    }));
}

export function listEmptySlotsMatchingFilters(
  grid: Record<string, string>,
  constraints: PlacementConstraints,
  sundays: readonly Date[]
): SlotDescriptor[] {
  const shiftSet = new Set(
    constraints.shifts.filter((s): s is CalendarShiftId =>
      (CALENDAR_SHIFT_ORDER as readonly string[]).includes(s)
    )
  );
  const empty = listEmptySlots(grid, sundays);
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
