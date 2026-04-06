import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DAYS,
  SHIFTS,
  ROLES,
  type DayId,
  type RoleId,
  type ShiftId,
  type VolunteerConstraints,
  matchSlots,
  groupByDay,
  openSlotCatalog,
  labelForDay,
  labelForShift,
  labelForRole,
  type ExtraRoleId,
  EXTRA_ROLES,
} from "../lib/volunteer-scheduling";
import {
  sundaysInMonth,
  formatDateBr,
  dateKeyLocal,
  scheduleCellKey,
  periodKey,
  type CalendarShiftId,
  loadScheduleStore,
  saveScheduleStore,
  findFirstMatchingEmptySlot,
  listEmptySlotsMatchingFilters,
  listEmptySlots,
  formatDescriptorLine,
  parseImportedGrid,
  findDuplicateNameAssignments,
  formatSlotDescriptor,
  enumerateScheduleSlots,
} from "../lib/may2026Schedule";
import {
  buildScheduleCsv,
  buildSchedulePlainText,
  downloadSchedulePdf,
  triggerDownloadText,
} from "../lib/scheduleReport";

type AiPanel = { text: string | null; error: string | null; loading: boolean };

const idleAi: AiPanel = { text: null, error: null, loading: false };

/** Último aviso de encaixe (mesmo após F5), por período — sessionStorage. */
const PLACEMENT_SESSION_KEY = "volunteer-scheduler-last-placement";

type RoomRow =
  | { key: "facilitador"; label: string; type: "facilitador" }
  | { key: string; label: string; type: "sala"; auxiliares: number };

const CALENDAR_ROWS: readonly RoomRow[] = [
  { key: "facilitador", label: "FACILITADOR", type: "facilitador" },
  { key: "kids", label: "KIDS", type: "sala", auxiliares: 3 },
  { key: "super_kids", label: "SUPER KIDS", type: "sala", auxiliares: 3 },
  { key: "juniores", label: "JUNIORES", type: "sala", auxiliares: 2 },
];

const MONTH_LABELS_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

/** Vaga vazia: foco azul para não confundir com “preenchido” (verde neon). */
const inputSlotEmptyClass =
  "w-full min-w-0 rounded-md border border-gray-300/90 bg-white px-1.5 py-1 text-xs text-gray-900 placeholder:text-gray-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-400/30 dark:border-gray-600 dark:bg-gray-900/75 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-sky-400 dark:focus:ring-sky-400/35";

/**
 * Vaga preenchida: borda verde neon grossa + brilho — repetido em TODAS as células
 * com nome, para leitura visual acumulativa da tabela (claro e escuro).
 */
const inputSlotFilledClass =
  "w-full min-w-0 rounded-md border-[3px] border-lime-500 bg-lime-50/95 px-1.5 py-1 text-xs font-semibold text-gray-900 placeholder:font-normal shadow-[0_0_0_1px_rgba(132,204,22,0.25),0_4px_14px_-2px_rgba(34,197,94,0.35)] focus:border-lime-600 focus:outline-none focus:ring-2 focus:ring-lime-400/50 dark:border-lime-400 dark:bg-lime-950/40 dark:text-lime-50 dark:shadow-[0_0_22px_rgba(190,242,100,0.45),0_0_0_1px_rgba(163,230,53,0.35)] dark:focus:border-lime-300 dark:focus:ring-lime-300/50";

const inputSlotDuplicateClass =
  "w-full min-w-0 rounded-md border-[3px] border-amber-500 bg-amber-50 px-1.5 py-1 text-xs font-semibold text-amber-950 placeholder:font-normal shadow-[0_0_0_1px_rgba(245,158,11,0.3),0_4px_14px_-2px_rgba(245,158,11,0.35)] focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400/50 dark:border-amber-400 dark:bg-amber-950/50 dark:text-amber-50 dark:shadow-[0_0_22px_rgba(251,191,36,0.4)] dark:focus:border-amber-300 dark:focus:ring-amber-400/45";

function slotInputClass(
  value: string,
  cellKey: string,
  duplicateKeys: Set<string>
): string {
  const t = value.trim();
  const dup = duplicateKeys.has(cellKey);
  if (dup) {
    return inputSlotDuplicateClass;
  }
  if (t.length > 0) {
    return inputSlotFilledClass;
  }
  return inputSlotEmptyClass;
}

function ShiftScheduleTable(props: {
  shiftId: CalendarShiftId;
  shiftLabel: string;
  headerClass: string;
  sundays: readonly Date[];
  values: Record<string, string>;
  duplicateKeys: Set<string>;
  onCellChange: (key: string, value: string) => void;
}) {
  const {
    shiftId,
    shiftLabel,
    headerClass,
    sundays,
    values,
    duplicateKeys,
    onCellChange,
  } = props;

  if (sundays.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-400">
        Este mês não tem domingos na grade (caso raro). Escolha outro mês/ano.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm dark:border-gray-700">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr>
            <th
              colSpan={sundays.length + 1}
              className={`px-3 py-2 text-center text-xs font-bold uppercase tracking-wide text-white ${headerClass}`}
            >
              {shiftLabel}
            </th>
          </tr>
          <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-800/80">
            <th className="w-36 border-r border-gray-200 px-2 py-2 text-xs font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200">
              Função / Sala
            </th>
            {sundays.map((d) => (
              <th
                key={dateKeyLocal(d)}
                className="min-w-[7.5rem] border-r border-gray-200 px-2 py-2 text-center text-xs font-semibold text-gray-700 last:border-r-0 dark:border-gray-600 dark:text-gray-200"
              >
                Dom {formatDateBr(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CALENDAR_ROWS.map((row) => (
            <tr
              key={row.key}
              className="border-b border-gray-200 last:border-b-0 dark:border-gray-600"
            >
              <td className="border-r border-gray-200 bg-gray-50/80 px-2 py-2 align-top text-xs font-semibold uppercase text-gray-800 dark:border-gray-600 dark:bg-gray-800/40 dark:text-gray-100">
                {row.label}
              </td>
              {sundays.map((d) => {
                const dk = dateKeyLocal(d);
                return (
                  <td
                    key={`${row.key}-${dk}`}
                    className="border-r border-gray-200 px-2 py-2 align-top last:border-r-0 dark:border-gray-600"
                  >
                    {row.type === "facilitador" ? (
                      <div className="space-y-0.5 text-xs">
                        <span className="font-medium text-gray-800 dark:text-gray-200">
                          Facilitador
                        </span>
                        <input
                          type="text"
                          value={
                            values[
                              scheduleCellKey(shiftId, dk, row.key, "fac")
                            ] ?? ""
                          }
                          onChange={(e) =>
                            onCellChange(
                              scheduleCellKey(shiftId, dk, row.key, "fac"),
                              e.target.value
                            )
                          }
                          placeholder="Nome"
                          autoComplete="off"
                          aria-label={`${shiftLabel} ${row.label} ${formatDateBr(d)} facilitador`}
                          className={slotInputClass(
                            values[
                              scheduleCellKey(shiftId, dk, row.key, "fac")
                            ] ?? "",
                            scheduleCellKey(shiftId, dk, row.key, "fac"),
                            duplicateKeys
                          )}
                        />
                      </div>
                    ) : (
                      <div className="space-y-1.5 text-xs">
                        <div>
                          <span className="font-semibold text-red-600 dark:text-red-400">
                            Titular
                          </span>
                          <input
                            type="text"
                            value={
                              values[
                                scheduleCellKey(shiftId, dk, row.key, "tit")
                              ] ?? ""
                            }
                            onChange={(e) =>
                              onCellChange(
                                scheduleCellKey(shiftId, dk, row.key, "tit"),
                                e.target.value
                              )
                            }
                            placeholder="Nome"
                            autoComplete="off"
                            aria-label={`${shiftLabel} ${row.label} ${formatDateBr(d)} titular`}
                            className={`mt-0.5 ${slotInputClass(
                              values[
                                scheduleCellKey(shiftId, dk, row.key, "tit")
                              ] ?? "",
                              scheduleCellKey(shiftId, dk, row.key, "tit"),
                              duplicateKeys
                            )}`}
                          />
                        </div>
                        {Array.from({ length: row.auxiliares }, (_, i) => {
                          const part = `aux${i}`;
                          const k = scheduleCellKey(shiftId, dk, row.key, part);
                          return (
                            <div
                              key={i}
                              className="border-t border-dashed border-gray-200 pt-1 dark:border-gray-600"
                            >
                              <span className="font-medium text-gray-700 dark:text-gray-300">
                                Auxiliar {i + 1}
                              </span>
                              <input
                                type="text"
                                value={values[k] ?? ""}
                                onChange={(e) =>
                                  onCellChange(k, e.target.value)
                                }
                                placeholder="Nome"
                                autoComplete="off"
                                aria-label={`${shiftLabel} ${row.label} ${formatDateBr(d)} auxiliar ${i + 1}`}
                                className={`mt-0.5 ${slotInputClass(
                                  values[k] ?? "",
                                  k,
                                  duplicateKeys
                                )}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function toggle<T extends string>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/**
 * Base da API sem barra final. Em desenvolvimento, sem VITE_API_BASE_URL,
 * retorna string vazia para usar `/api/...` na mesma origem (proxy no Vite).
 */
function apiBackendBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t.length > 0) return t.replace(/\/$/, "");
  }
  if (import.meta.env.DEV) return "";
  return "http://127.0.0.1:3002";
}

function geminiSuggestUrl(): string {
  const b = apiBackendBase();
  return b.length > 0 ? `${b}/api/gemini-suggest` : "/api/gemini-suggest";
}

function describeApiForNetworkError(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return `${raw.trim().replace(/\/$/, "")}/api/gemini-suggest (VITE_API_BASE_URL)`;
  }
  if (import.meta.env.DEV) {
    return "/api/gemini-suggest → proxy Vite → http://127.0.0.1:3002";
  }
  return "http://127.0.0.1:3002/api/gemini-suggest (padrão fora do modo dev)";
}

function networkErrorUserMessage(): string {
  return [
    "Não foi possível conectar ao servidor da IA.",
    "",
    "Checklist:",
    `• URL usada: ${describeApiForNetworkError()}`,
    "• Inicie volunteer-api na porta 3002 (ex.: pasta volunteer-api → npm start ou node src/server.js).",
    '• Teste http://127.0.0.1:3002/health — deve retornar JSON com "ok": true.',
    "• Com a API ligada, envie a pergunta de novo (ou use o botão da ação anterior).",
    "• Se a API estiver noutro host/porta, defina VITE_API_BASE_URL no .env do front e reinicie yarn dev.",
  ].join("\n");
}

function isLikelyNetworkFetchFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("networkerror") ||
    m.includes("failed to fetch") ||
    m.includes("load failed") ||
    m.includes("network request failed") ||
    (err instanceof TypeError && m.includes("fetch"))
  );
}

function toUserFacingRequestError(err: unknown): string {
  if (isLikelyNetworkFetchFailure(err)) {
    return networkErrorUserMessage();
  }
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  return "Falha na requisição.";
}

async function fetchGeminiSuggestion(
  body: Record<string, unknown>
): Promise<string> {
  const url = geminiSuggestUrl();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data: { suggestion?: string; error?: string };
  try {
    data = (await res.json()) as { suggestion?: string; error?: string };
  } catch {
    throw new Error(
      res.ok
        ? "Resposta do servidor não é JSON válido."
        : `Erro ${res.status}: ${res.statusText || "resposta inválida"}.`
    );
  }
  if (!res.ok) {
    const httpMsg =
      res.statusText.trim().length > 0
        ? res.statusText
        : `Erro HTTP ${res.status}`;
    const apiErr =
      typeof data.error === "string" && data.error.trim().length > 0
        ? data.error
        : null;
    throw new Error(apiErr ?? httpMsg);
  }
  if (!data.suggestion) {
    throw new Error("Resposta sem texto");
  }
  return data.suggestion;
}

async function postGemini(
  setState: React.Dispatch<React.SetStateAction<AiPanel>>,
  body: Record<string, unknown>
) {
  setState({ text: null, error: null, loading: true });
  try {
    const suggestion = await fetchGeminiSuggestion(body);
    setState({ text: suggestion, error: null, loading: false });
  } catch (err) {
    setState({
      text: null,
      error: toUserFacingRequestError(err),
      loading: false,
    });
  }
}

type AssistantChatTurn = { role: "user" | "assistant"; text: string };

function buildAssistantContextPayload(
  periodLabel: string,
  scheduleGrid: Record<string, string>,
  sundays: readonly Date[],
  duplicates: { displayName: string; cellKeys: string[] }[]
): string {
  const slots = enumerateScheduleSlots(sundays);
  let filled = 0;
  for (const s of slots) {
    const v = scheduleGrid[s.key];
    if (v && String(v).trim()) filled++;
  }
  const emptySample = listEmptySlots(scheduleGrid, sundays)
    .slice(0, 42)
    .map(formatDescriptorLine);
  const dupBlock =
    duplicates.length > 0
      ? duplicates
          .map((d) => {
            const preview = d.cellKeys
              .slice(0, 5)
              .map((k) => formatSlotDescriptor(k))
              .join("; ");
            const more =
              d.cellKeys.length > 5
                ? ` (+${d.cellKeys.length - 5} outra(s))`
                : "";
            return `- "${d.displayName}" (${d.cellKeys.length} célula(s)): ${preview}${more}`;
          })
          .join("\n")
      : null;

  return [
    `Período da escala: ${periodLabel}`,
    `Preenchimento aproximado: ${filled} de ${slots.length} posições com nome.`,
    dupBlock
      ? `Nomes repetidos em mais de uma célula:\n${dupBlock}`
      : "Duplicados: nenhum nome aparece em mais de uma célula (pelos critérios do sistema).",
    emptySample.length > 0
      ? `Amostra de vagas ainda vazias (referência real; lista pode continuar além):\n${emptySample.map((l) => `- ${l}`).join("\n")}`
      : "Vagas vazias na amostra: nenhuma — a escala pode estar completa neste período.",
  ].join("\n\n");
}

const DEFAULT_SCHEDULE_YEAR = 2026;
const DEFAULT_SCHEDULE_MONTH = 5;

export function VolunteerScheduler() {
  const [name, setName] = useState("");
  const [days, setDays] = useState<Set<DayId>>(new Set());
  const [shifts, setShifts] = useState<Set<ShiftId>>(new Set());
  const [roles, setRoles] = useState<Set<RoleId>>(new Set());
  const [extraRoles, setExtraRoles] = useState<Set<ExtraRoleId>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<AiPanel>(idleAi);
  const [aiNoMatch, setAiNoMatch] = useState<AiPanel>(idleAi);
  const [aiConfirm, setAiConfirm] = useState<AiPanel>(idleAi);

  const [scheduleYear, setScheduleYear] = useState(DEFAULT_SCHEDULE_YEAR);
  const [scheduleMonth, setScheduleMonth] = useState(DEFAULT_SCHEDULE_MONTH);
  const [allGrids, setAllGrids] = useState<
    Record<string, Record<string, string>>
  >({});
  const [storageReady, setStorageReady] = useState(false);
  const [undoStack, setUndoStack] = useState<Record<string, string>[]>([]);
  const allGridsRef = useRef(allGrids);
  const importInputRef = useRef<HTMLInputElement>(null);
  const prevPeriodKeyRef = useRef<string | null>(null);
  const encaixarStartRef = useRef(0);
  const [encaixarBusy, setEncaixarBusy] = useState(false);

  const [placementSuccess, setPlacementSuccess] = useState<string | null>(null);
  const [placementVacancies, setPlacementVacancies] = useState<{
    title: string;
    lines: string[];
  } | null>(null);

  const [assistantOpen, setAssistantOpen] = useState(true);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantChat, setAssistantChat] = useState<AssistantChatTurn[]>([]);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [assistantShowRetry, setAssistantShowRetry] = useState(false);
  const assistantScrollRef = useRef<HTMLDivElement>(null);
  const assistantRetryTextRef = useRef<string | null>(null);

  useEffect(() => {
    allGridsRef.current = allGrids;
  }, [allGrids]);

  const periodKeyStr = useMemo(
    () => periodKey(scheduleYear, scheduleMonth),
    [scheduleYear, scheduleMonth]
  );

  const sundays = useMemo(
    () => sundaysInMonth(scheduleYear, scheduleMonth - 1),
    [scheduleYear, scheduleMonth]
  );

  const scheduleGrid = allGrids[periodKeyStr] ?? {};

  const duplicateGroups = useMemo(
    () => findDuplicateNameAssignments(scheduleGrid),
    [scheduleGrid]
  );

  const duplicateKeys = useMemo(
    () => new Set(duplicateGroups.flatMap((d) => d.cellKeys)),
    [duplicateGroups]
  );

  const periodLabelFull = useMemo(
    () => `${MONTH_LABELS_PT[scheduleMonth - 1]} de ${scheduleYear}`,
    [scheduleYear, scheduleMonth]
  );

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const s = loadScheduleStore();
    setAllGrids({ ...s.grids });
    setScheduleYear(s.year);
    setScheduleMonth(s.month);
    try {
      const raw = sessionStorage.getItem(PLACEMENT_SESSION_KEY);
      if (raw) {
        const j = JSON.parse(raw) as { periodKey?: string; message?: string };
        const pk = periodKey(s.year, s.month);
        if (j.periodKey === pk && typeof j.message === "string") {
          setPlacementSuccess(j.message);
        }
      }
    } catch {
      /* ignore */
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    saveScheduleStore({
      version: 2,
      year: scheduleYear,
      month: scheduleMonth,
      grids: allGrids,
    });
  }, [storageReady, scheduleYear, scheduleMonth, allGrids]);

  useEffect(() => {
    if (typeof window === "undefined" || !storageReady) return;
    if (placementSuccess) {
      sessionStorage.setItem(
        PLACEMENT_SESSION_KEY,
        JSON.stringify({
          periodKey: periodKey(scheduleYear, scheduleMonth),
          message: placementSuccess,
        })
      );
    } else {
      sessionStorage.removeItem(PLACEMENT_SESSION_KEY);
    }
  }, [storageReady, placementSuccess, scheduleYear, scheduleMonth]);

  useEffect(() => {
    if (prevPeriodKeyRef.current === null) {
      prevPeriodKeyRef.current = periodKeyStr;
      return;
    }
    if (prevPeriodKeyRef.current === periodKeyStr) return;
    prevPeriodKeyRef.current = periodKeyStr;
    setUndoStack([]);
    setPlacementSuccess(null);
    setPlacementVacancies(null);
    setAssistantChat([]);
    setAssistantError(null);
    setAssistantShowRetry(false);
    assistantRetryTextRef.current = null;
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(PLACEMENT_SESSION_KEY);
    }
  }, [periodKeyStr]);

  useEffect(() => {
    const el = assistantScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [assistantChat, assistantBusy, assistantOpen]);

  function pushUndoSnapshot() {
    const snap = structuredClone(
      allGridsRef.current[periodKeyStr] ?? {}
    ) as Record<string, string>;
    setUndoStack((stack) => [...stack.slice(-49), snap]);
  }

  /** Desfazer cobre encaixar automático, importação e limpar — edição direta na célula não empilha. */
  function patchCurrentGridWithUndo(
    updater: (g: Record<string, string>) => Record<string, string>
  ) {
    pushUndoSnapshot();
    setAllGrids((prev) => {
      const cur = prev[periodKeyStr] ?? {};
      return { ...prev, [periodKeyStr]: updater(cur) };
    });
  }

  function setCellValue(key: string, value: string) {
    setAllGrids((prev) => ({
      ...prev,
      [periodKeyStr]: { ...(prev[periodKeyStr] ?? {}), [key]: value },
    }));
  }

  function handleUndo() {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const prev = structuredClone(stack[stack.length - 1]) as Record<
        string,
        string
      >;
      setAllGrids((all) => ({ ...all, [periodKeyStr]: prev }));
      return stack.slice(0, -1);
    });
  }

  function handleLimparEscala() {
    if (
      !window.confirm(
        `Limpar todos os nomes da escala de ${MONTH_LABELS_PT[scheduleMonth - 1]} de ${scheduleYear}? Você pode desfazer com "Desfazer".`
      )
    ) {
      return;
    }
    patchCurrentGridWithUndo(() => ({}));
    setPlacementSuccess(null);
    setPlacementVacancies(null);
  }

  function handleImportJsonFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const data = JSON.parse(text) as unknown;
        const grid = parseImportedGrid(data);
        if (!grid || Object.keys(grid).length === 0) {
          window.alert(
            "JSON inválido ou sem campo \"grid\". Use um arquivo exportado por esta página ou o mesmo formato."
          );
          return;
        }
        pushUndoSnapshot();
        setAllGrids((prev) => ({
          ...prev,
          [periodKeyStr]: grid,
        }));
        setPlacementSuccess(
          `Importação concluída para ${MONTH_LABELS_PT[scheduleMonth - 1]}/${scheduleYear}.`
        );
        setPlacementVacancies(null);
      } catch {
        window.alert("Não foi possível ler o JSON.");
      }
    };
    reader.readAsText(file, "UTF-8");
  }

  const constraints: VolunteerConstraints = useMemo(
    () => ({
      name: name.trim(),
      days: [...days],
      shifts: [...shifts],
      roles: [...roles],
      extraRoles: [...extraRoles],
    }),
    [name, days, shifts, roles, extraRoles]
  );

  const matched = useMemo(
    () => matchSlots(constraints),
    [constraints]
  );

  const byDay = useMemo(() => groupByDay(matched), [matched]);

  const selectedSlot = useMemo(
    () => matched.find((s) => s.id === selectedSlotId) ?? null,
    [matched, selectedSlotId]
  );

  const canSubmit =
    constraints.name.length > 0 &&
    constraints.days.length > 0 &&
    constraints.shifts.length > 0 &&
    constraints.roles.length > 0;

  const needsRoomForGrid =
    roles.has("titular") || roles.has("auxiliar");

  const canEncaixarNaTabela =
    name.trim().length > 0 &&
    days.has("dom") &&
    shifts.size > 0 &&
    roles.size > 0 &&
    (!needsRoomForGrid || extraRoles.size > 0);

  function exportScheduleJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      year: scheduleYear,
      month: scheduleMonth,
      monthLabel: MONTH_LABELS_PT[scheduleMonth - 1],
      periodKey: periodKeyStr,
      sundaysDomingo: true,
      grid: scheduleGrid,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `escala-voluntarios-${scheduleYear}-${String(scheduleMonth).padStart(2, "0")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function reportBasename() {
    return `escala-voluntarios-${scheduleYear}-${String(scheduleMonth).padStart(2, "0")}`;
  }

  function handleExportPdf() {
    downloadSchedulePdf(
      scheduleGrid,
      sundays,
      scheduleYear,
      scheduleMonth,
      `${reportBasename()}.pdf`
    );
  }

  function handleExportCsv() {
    const csv = buildScheduleCsv(
      scheduleGrid,
      sundays,
      scheduleYear,
      scheduleMonth
    );
    triggerDownloadText(
      "\uFEFF" + csv,
      `${reportBasename()}.csv`,
      "text/csv;charset=utf-8"
    );
  }

  function handleExportTxt() {
    const txt = buildSchedulePlainText(
      scheduleGrid,
      sundays,
      scheduleYear,
      scheduleMonth
    );
    triggerDownloadText(txt, `${reportBasename()}.txt`, "text/plain;charset=utf-8");
  }

  function finishEncaixarInteraction(minVisibleMs: number) {
    const elapsed = Date.now() - encaixarStartRef.current;
    const wait = Math.max(0, minVisibleMs - elapsed);
    window.setTimeout(() => setEncaixarBusy(false), wait);
  }

  function handleEncaixarNaTabela() {
    if (encaixarBusy) return;
    encaixarStartRef.current = Date.now();
    setEncaixarBusy(true);

    setPlacementSuccess(null);
    setPlacementVacancies(null);
    const trimmed = name.trim();
    if (!trimmed) {
      finishEncaixarInteraction(240);
      window.alert("Informe o nome do voluntário.");
      return;
    }
    if (!days.has("dom")) {
      finishEncaixarInteraction(240);
      window.alert(
        'A tabela usa apenas os domingos do mês selecionado. Marque "Domingo" em Dias para encaixar automaticamente.'
      );
      return;
    }
    if (shifts.size === 0) {
      finishEncaixarInteraction(240);
      window.alert("Selecione ao menos um turno.");
      return;
    }
    if (roles.size === 0) {
      finishEncaixarInteraction(240);
      window.alert("Selecione ao menos uma função.");
      return;
    }
    if (needsRoomForGrid && extraRoles.size === 0) {
      finishEncaixarInteraction(240);
      window.alert(
        "Para Titular ou Auxiliar, selecione ao menos uma sala (Kids, Super Kids ou Juniores)."
      );
      return;
    }

    const placementConstraints = {
      shifts: [...shifts] as ShiftId[],
      roles: [...roles] as RoleId[],
      extraRoles: [...extraRoles] as ExtraRoleId[],
    };

    const found = findFirstMatchingEmptySlot(
      scheduleGrid,
      placementConstraints,
      sundays
    );

    if (found) {
      patchCurrentGridWithUndo((g) => ({ ...g, [found.key]: trimmed }));
      setPlacementSuccess(
        `${trimmed} foi encaixado(a) em: ${found.label}. A escala acumula cada nome e já foi salva neste navegador.`
      );
      finishEncaixarInteraction(520);
      return;
    }

    const matchingFree = listEmptySlotsMatchingFilters(
      scheduleGrid,
      placementConstraints,
      sundays
    );
    const lines =
      matchingFree.length > 0
        ? matchingFree.map(formatDescriptorLine)
        : listEmptySlots(scheduleGrid, sundays).map(formatDescriptorLine);

    const title =
      matchingFree.length > 0
        ? "Com o perfil que você marcou, ainda há estas vagas livres (preencha manualmente na tabela):"
        : "Com esse perfil não há vagas livres. Todas as vagas ainda vazias na escala:";

    const preview = lines.slice(0, 28).join("\n");
    const suffix =
      lines.length > 28
        ? `\n… e mais ${lines.length - 28} vaga(s). Veja a lista completa abaixo.`
        : "";

    window.alert(
      `Não foi possível encaixar automaticamente (todas as vagas compatíveis nesta ordem já estão ocupadas).\n\n${title}\n\n${preview}${suffix}`
    );

    setPlacementVacancies({ title, lines });
    finishEncaixarInteraction(520);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setAiSummary(idleAi);
    setAiNoMatch(idleAi);
    setAiConfirm(idleAi);
    setSubmitted(true);
    setSelectedSlotId(null);
  }

  function reset() {
    setSubmitted(false);
    setSelectedSlotId(null);
    setAiSummary(idleAi);
    setAiNoMatch(idleAi);
    setAiConfirm(idleAi);
    setPlacementSuccess(null);
    setPlacementVacancies(null);
  }

  function requestGeminiSummary() {
    void postGemini(setAiSummary, {
      volunteerName: constraints.name,
      days: constraints.days,
      shifts: constraints.shifts,
      roles: constraints.roles,
      matchedSlots: matched.map((s) => ({
        day: s.day,
        shift: s.shift,
        role: s.role,
        spotsLeft: s.spotsLeft,
      })),
    });
  }

  function requestNoMatchHint() {
    void postGemini(setAiNoMatch, {
      kind: "no_match_hint",
      volunteerName: constraints.name,
      days: constraints.days,
      shifts: constraints.shifts,
      roles: constraints.roles,
      openCatalog: openSlotCatalog(),
    });
  }

  function requestSlotConfirm() {
    if (!selectedSlot) return;
    void postGemini(setAiConfirm, {
      kind: "slot_confirm",
      volunteerName: constraints.name,
      slot: {
        day: selectedSlot.day,
        shift: selectedSlot.shift,
        role: selectedSlot.role,
      },
    });
  }

  const assistantGreetingName =
    name.trim().length > 0 ? name.trim().split(/\s+/)[0]! : "coordenador(a)";

  async function sendAssistantMessage(
    raw: string,
    mode: "new" | "retry" = "new"
  ) {
    const userMessage = raw.trim();
    if (!userMessage || assistantBusy) return;
    setAssistantError(null);
    setAssistantShowRetry(false);
    if (mode === "new") {
      setAssistantChat((c) => [...c, { role: "user", text: userMessage }]);
      setAssistantInput("");
    }
    assistantRetryTextRef.current = userMessage;
    setAssistantBusy(true);
    try {
      const scheduleContext = buildAssistantContextPayload(
        periodLabelFull,
        scheduleGrid,
        sundays,
        duplicateGroups
      );
      const suggestion = await fetchGeminiSuggestion({
        kind: "schedule_assistant",
        userMessage,
        scheduleContext,
        periodLabel: periodLabelFull,
        volunteerName: name.trim() || "Coordenador(a)",
      });
      setAssistantChat((c) => [...c, { role: "assistant", text: suggestion }]);
      assistantRetryTextRef.current = null;
    } catch (err) {
      setAssistantError(toUserFacingRequestError(err));
      setAssistantShowRetry(true);
    } finally {
      setAssistantBusy(false);
    }
  }

  function openAssistantForDuplicateGuidance() {
    if (duplicateGroups.length === 0) return;
    setAssistantOpen(true);
    void sendAssistantMessage(
      "Com base no contexto sobre nomes repetidos (se houver), o que devo revisar primeiro e quais passos você sugere?",
      "new"
    );
  }

  return (
    <div
      className={`relative min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/80 dark:from-gray-950 dark:via-gray-900 dark:to-emerald-950/40 ${assistantOpen ? "lg:mr-[22rem] xl:mr-[24rem]" : ""} transition-[margin] duration-300 ease-out`}
    >
      <div className="mx-auto max-w-3xl px-4 pt-12 sm:pt-16">
        <header className="mb-10 text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Agendamento de voluntários
          </p>
          <h1 className="mt-8 text-3xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
            Escolha quando e como escalar o voluntário
          </h1>
          <p className="mt-5 text-balance text-gray-600 dark:text-gray-400">
            Informe o nome do voluntário e em quais dias, turnos e funções ele pode atuar.
            Mostramos os dias e horários compatíveis com as vagas abertas.
          </p>
        </header>
      </div>

      <div className="mx-auto max-w-3xl px-4">
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-gray-200/80 bg-white/90 p-6 shadow-xl shadow-gray-200/50 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90 dark:shadow-black/20 sm:p-8"
        >
          <div className="space-y-8">
            <div>
              <label
                htmlFor="volunteer-name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Nome do voluntário
              </label>
              <input
                id="volunteer-name"
                type="text"
                autoComplete="name"
                placeholder="digite o nome do voluntário"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSubmitted(false);
                }}
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
              />
            </div>

            <fieldset>
              <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Dias
              </legend>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Para encaixar na tabela do mês escolhido abaixo, inclua{" "}
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Domingo
                </span>{" "}
                (as colunas são só os domingos daquele mês).
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {DAYS.map((d) => {
                  const active = days.has(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        setDays((prev) => toggle(prev, d.id));
                        setSubmitted(false);
                      }}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                        active
                          ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Turnos 
              </legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {SHIFTS.map((s) => {
                  const active = shifts.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setShifts((prev) => toggle(prev, s.id));
                        setSubmitted(false);
                      }}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                        active
                          ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Funções 
              </legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {ROLES.map((r) => {
                  const active = roles.has(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setRoles((prev) => toggle(prev, r.id));
                        setSubmitted(false);
                      }}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                        active
                          ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      }`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            
            <fieldset>
              <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Salas
              </legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {EXTRA_ROLES.map((r) => {
                  const active = extraRoles.has(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setExtraRoles((prev) => toggle(prev, r.id));
                        setSubmitted(false);
                      }}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                        active
                          ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-600"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      }`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-600"
              >
                Ver dias e horários compatíveis
              </button>
              <button
                type="button"
                onClick={handleEncaixarNaTabela}
                disabled={!canEncaixarNaTabela || encaixarBusy}
                aria-busy={encaixarBusy}
                title={
                  encaixarBusy
                    ? "Processando encaixe…"
                    : !days.has("dom")
                      ? 'Marque "Domingo" para encaixar na escala mensal'
                      : undefined
                }
                className="inline-flex min-w-[11.5rem] items-center justify-center gap-2 rounded-xl border-2 border-emerald-600/50 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/60"
              >
                {encaixarBusy ? (
                  <>
                    <svg
                      className="h-4 w-4 shrink-0 animate-spin text-emerald-700 dark:text-emerald-300"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden={true}
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Encaixando…
                  </>
                ) : (
                  "Encaixar na tabela"
                )}
              </button>
              {submitted && (
                <button
                  type="button"
                  onClick={reset}
                  className="text-sm font-medium text-gray-600 underline-offset-4 hover:underline dark:text-gray-400"
                >
                  Ajustar filtros
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <strong className="font-medium text-gray-700 dark:text-gray-300">
                Encaixar na tabela
              </strong>{" "}
              coloca o nome na primeira vaga livre que combina com turno, função e
              salas marcados (na ordem dos domingos). Cada encaixe soma ao que já
              está preenchido e fica salvo no navegador. Use{" "}
              <strong className="font-medium text-gray-700 dark:text-gray-300">
                Desfazer
              </strong>{" "}
              para voltar o último encaixe, importação ou limpeza (edição direta na
              célula não entra na pilha).
            </p>
          </div>
        </form>
      </div>

      <div className="mx-auto mt-10 max-w-6xl px-4 sm:px-6">
        <div className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white/90 shadow-md shadow-gray-200/30 ring-1 ring-black/[0.03] backdrop-blur-sm dark:border-gray-700/90 dark:bg-gray-900/75 dark:shadow-black/25 dark:ring-white/[0.06]">
          <div className="divide-y divide-gray-100 dark:divide-gray-700/80">
            {placementSuccess && (
              <div
                className="flex gap-4 px-5 py-4 sm:px-6 sm:py-5"
                role="status"
                aria-live="polite"
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-lime-400/90 to-emerald-500 text-white shadow-md shadow-lime-500/25 dark:from-lime-500 dark:to-emerald-600 dark:shadow-lime-900/30"
                  aria-hidden={true}
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                    Encaixe registrado
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-800 dark:text-gray-100">
                    {placementSuccess}
                  </p>
                </div>
              </div>
            )}

            {placementVacancies && placementVacancies.lines.length > 0 && (
              <div
                className="px-5 py-4 sm:px-6 sm:py-5"
                role="region"
                aria-label="Vagas livres para preenchimento manual"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300/90">
                  Vagas compatíveis ainda livres
                </p>
                <p className="mt-1 text-sm font-medium text-amber-950 dark:text-amber-100">
                  {placementVacancies.title}
                </p>
                <ul className="mt-3 max-h-48 list-inside list-disc space-y-1 overflow-y-auto text-xs leading-relaxed text-amber-900/95 dark:text-amber-100/90 sm:text-sm">
                  {placementVacancies.lines.map((line, i) => (
                    <li key={`${line}-${i}`}>{line}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-gradient-to-r from-gray-50/95 to-emerald-50/40 px-5 py-4 sm:px-6 dark:from-gray-950/80 dark:to-emerald-950/20">
              <p className="text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                Legenda das células
              </p>
              <div className="mx-auto mt-3 flex max-w-2xl flex-col gap-3 sm:mt-4 sm:flex-row sm:justify-center sm:gap-6">
                <div className="flex items-start gap-3 rounded-xl border border-lime-400/50 bg-white/90 px-3 py-2.5 shadow-sm dark:border-lime-500/35 dark:bg-gray-900/60">
                  <span className="mt-0.5 inline-flex h-5 min-w-[3.25rem] items-center justify-center rounded-md border-2 border-lime-500 bg-lime-50 text-[10px] font-bold text-lime-800 dark:border-lime-400 dark:bg-lime-950/50 dark:text-lime-200">
                    Verde
                  </span>
                  <span className=" text-xs leading-snug text-gray-600 dark:text-gray-300">
                    Vaga preenchida
        
                  </span>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-amber-400/45 bg-white/90 px-5 py-2.5 shadow-sm dark:border-amber-500/35 dark:bg-gray-900/60">
                  <span className="mt-0.5 inline-flex h-5 min-w-[3.25rem] items-center justify-center rounded-md border-2 border-amber-500 bg-amber-50 text-[10px] font-bold text-amber-900 dark:border-amber-400 dark:bg-amber-950/50 dark:text-amber-100">
                    Âmbar
                  </span>
                  <span className=" text-xs leading-snug text-gray-600 dark:text-gray-300">
                    Nome repetido: Confira se foi
                    intencional. 
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

        <section
          className="mx-auto mt-10 max-w-6xl px-4 sm:px-6"
          aria-labelledby="calendario-vagas-titulo"
        >
          <h2
            id="calendario-vagas-titulo"
            className="text-center text-lg font-semibold text-gray-900 dark:text-white"
          >
            Calendário de vagas nos domingos de{" "}
            {MONTH_LABELS_PT[scheduleMonth - 1]} de {scheduleYear}
          </h2>
          <div className="mx-auto mt-4 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end sm:justify-center">
            <div className="flex flex-1 flex-col gap-1">
              <label
                htmlFor="schedule-month"
                className="text-xs font-medium text-gray-600 dark:text-gray-400"
              >
                Mês
              </label>
              <select
                id="schedule-month"
                value={scheduleMonth}
                onChange={(e) => setScheduleMonth(Number(e.target.value))}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              >
                {MONTH_LABELS_PT.map((label, i) => (
                  <option key={label} value={i + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <label
                htmlFor="schedule-year"
                className="text-xs font-medium text-gray-600 dark:text-gray-400"
              >
                Ano
              </label>
              <select
                id="schedule-year"
                value={scheduleYear}
                onChange={(e) => setScheduleYear(Number(e.target.value))}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              >
                {Array.from({ length: 12 }, (_, i) => 2024 + i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-gray-600 dark:text-gray-400">
            Preencha os nomes conforme os critérios de cada função. Por turno
            (manhã, tarde e noite):{" "}
            <strong className="font-medium text-gray-800 dark:text-gray-200">
              Facilitador
            </strong>{" "}
            (1); em cada sala:{" "}
            <strong className="font-medium text-gray-800 dark:text-gray-200">
              Titular
            </strong>{" "}
            (1) e{" "}
            <strong className="font-medium text-gray-800 dark:text-gray-200">
              Auxiliares
            </strong>{" "}
            — 3 em Kids e Super Kids, 2 em Juniores. Cada mês/ano tem sua escala
            guardada neste aparelho.
          </p>
          <div className="mt-4 flex flex-col items-stretch gap-3 sm:items-center">
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                Desfazer
              </button>
              <button
                type="button"
                onClick={handleLimparEscala}
                className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-900 transition hover:bg-red-100 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100 dark:hover:bg-red-950/80"
              >
                Limpar escala
              </button>
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                Importar JSON
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleImportJsonFile}
              />
              <button
                type="button"
                onClick={exportScheduleJson}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                Exportar JSON
              </button>
            </div>
            <p className="text-center text-xs font-medium text-gray-700 dark:text-gray-300">
              Relatório para enviar
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={handleExportPdf}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
              >
                PDF
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                className="rounded-lg border border-emerald-600/50 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-100"
              >
                CSV (Excel)
              </button>
              <button
                type="button"
                onClick={handleExportTxt}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                Texto (.txt)
              </button>
            </div>
            <p className="text-center text-xs text-gray-500 dark:text-gray-400">
              JSON inclui metadados e a grade; PDF/CSV/TXT refletem o mês e ano
              selecionados. Tudo permanece em localStorage por período.
            </p>
          </div>
          {duplicateGroups.length > 0 && (
            <div
              className="mx-auto mt-3 max-w-3xl rounded-lg border border-gray-200/80 bg-gray-50/40 px-3 py-2 dark:border-gray-700/50 dark:bg-gray-900/35"
              role="status"
            >
              <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Nomes repetidos
                </span>{" "}
                — o mesmo nome em mais de uma célula (âmbar na tabela). O
                assistente à direita pode ajudar com dúvidas e sugestões.
              </p>
              <button
                type="button"
                onClick={openAssistantForDuplicateGuidance}
                disabled={assistantBusy}
                className="mt-1.5 rounded-md border border-gray-300/90 bg-white px-2.5 py-1 text-xs font-normal text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800/80 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                Assistente: repetidos e vagas
              </button>
            </div>
          )}
          <div className="mt-6 space-y-8">
            <ShiftScheduleTable
              shiftId="manha"
              shiftLabel="MANHÃ"
              headerClass="bg-amber-600 dark:bg-amber-700"
              sundays={sundays}
              values={scheduleGrid}
              duplicateKeys={duplicateKeys}
              onCellChange={setCellValue}
            />
            <ShiftScheduleTable
              shiftId="tarde"
              shiftLabel="TARDE"
              headerClass="bg-blue-600 dark:bg-blue-700"
              sundays={sundays}
              values={scheduleGrid}
              duplicateKeys={duplicateKeys}
              onCellChange={setCellValue}
            />
            <ShiftScheduleTable
              shiftId="noite"
              shiftLabel="NOITE"
              headerClass="bg-violet-900 dark:bg-violet-950"
              sundays={sundays}
              values={scheduleGrid}
              duplicateKeys={duplicateKeys}
              onCellChange={setCellValue}
            />
          </div>
        </section>

      <div className="mx-auto max-w-3xl px-4 pb-12 sm:pb-16">
        {submitted && (
          <section
            className="mt-10 rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-6 dark:border-emerald-900/50 dark:bg-emerald-950/30 sm:p-8"
            aria-live="polite"
          >
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {matched.length === 0
                ? "Nenhuma vaga encontrada"
                : `Olá, ${constraints.name}! Estes são os encaixes possíveis`}
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {matched.length === 0
                ? "Não há vagas abertas que combinem com todos os critérios ao mesmo tempo. Tente incluir mais dias, turnos ou funções."
                : "Cada card agrupa por dia. Escolha um horário para confirmar seu direcionamento."}
            </p>

            {matched.length === 0 && (
              <div className="mt-4 rounded-xl border border-amber-200/60 bg-white/70 p-4 dark:border-amber-900/40 dark:bg-gray-900/60">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  A IA pode sugerir ajustes nos filtros com base nas vagas que
                  ainda existem no sistema (servidor{" "}
                  <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">
                    volunteer-api
                  </code>{" "}
                  + chave Gemini).
                </p>
                <button
                  type="button"
                  onClick={requestNoMatchHint}
                  disabled={aiNoMatch.loading}
                  className="mt-3 inline-flex items-center rounded-lg border border-amber-600/40 bg-amber-600/10 px-4 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-600/20 disabled:cursor-not-allowed disabled:opacity-60 dark:text-amber-100"
                >
                  {aiNoMatch.loading ? "Gerando…" : "Sugestões com IA"}
                </button>
                {aiNoMatch.error && (
                  <p
                    className="mt-2 whitespace-pre-wrap text-sm text-red-600 dark:text-red-400"
                    role="alert"
                  >
                    {aiNoMatch.error}
                  </p>
                )}
                {aiNoMatch.text && (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                    {aiNoMatch.text}
                  </p>
                )}
              </div>
            )}

            {matched.length > 0 && (
              <div className="mt-4 rounded-xl border border-emerald-200/60 bg-white/70 p-4 dark:border-emerald-900/40 dark:bg-gray-900/60">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Gere um resumo cordial das opções abaixo (API Gemini no
                  backend).
                </p>
                <button
                  type="button"
                  onClick={requestGeminiSummary}
                  disabled={aiSummary.loading}
                  className="mt-3 inline-flex items-center rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-4 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-600/20 disabled:cursor-not-allowed disabled:opacity-60 dark:text-emerald-200"
                >
                  {aiSummary.loading ? "Gerando…" : "Resumo com IA (Gemini)"}
                </button>
                {aiSummary.error && (
                  <p
                    className="mt-2 whitespace-pre-wrap text-sm text-red-600 dark:text-red-400"
                    role="alert"
                  >
                    {aiSummary.error}
                  </p>
                )}
                {aiSummary.text && (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                    {aiSummary.text}
                  </p>
                )}
              </div>
            )}

            {matched.length > 0 && (
              <ul className="mt-6 space-y-6">
                {[...byDay.entries()].map(([dayId, slots]) => (
                  <li key={dayId}>
                    <h3 className="flex items-center gap-2 text-base font-semibold text-emerald-800 dark:text-emerald-300">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-sm text-white dark:bg-emerald-500">
                        {labelForDay(dayId).slice(0, 1)}
                      </span>
                      {labelForDay(dayId)}
                    </h3>
                    <ul className="mt-3 space-y-2">
                      {slots.map((slot) => {
                        const selected = selectedSlotId === slot.id;
                        return (
                          <li key={slot.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedSlotId(slot.id);
                                setAiConfirm(idleAi);
                              }}
                              className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${
                                selected
                                  ? "border-emerald-500 bg-white ring-2 ring-emerald-500/30 dark:bg-gray-900"
                                  : "border-gray-200 bg-white/80 hover:border-emerald-300 dark:border-gray-700 dark:bg-gray-900/80"
                              }`}
                            >
                              <span className="font-medium text-gray-900 dark:text-white">
                                {labelForShift(slot.shift)} ·{" "}
                                {labelForRole(slot.role)}
                              </span>
                              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                                {slot.spotsLeft} vaga(s) disponível(is)
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            )}

            {matched.length > 0 && selectedSlot && (
              <div className="mt-6 rounded-xl border border-dashed border-emerald-400/60 bg-white/90 p-4 dark:bg-gray-900/90">
                <p className="text-sm text-gray-800 dark:text-gray-200">
                  <strong>{constraints.name}</strong> fica direcionado(a) para{" "}
                  <strong>{labelForDay(selectedSlot.day)}</strong>,{" "}
                  {labelForShift(selectedSlot.shift).split("(")[0].trim()}, em{" "}
                  {labelForRole(selectedSlot.role)}.
                </p>
                <button
                  type="button"
                  onClick={requestSlotConfirm}
                  disabled={aiConfirm.loading}
                  className="mt-3 inline-flex items-center rounded-lg border border-emerald-500/50 bg-emerald-600/5 px-4 py-2 text-sm font-medium text-emerald-900 transition hover:bg-emerald-600/10 disabled:cursor-not-allowed disabled:opacity-60 dark:text-emerald-100"
                >
                  {aiConfirm.loading
                    ? "Gerando…"
                    : "Mensagem de confirmação com IA"}
                </button>
                {aiConfirm.error && (
                  <p
                    className="mt-2 whitespace-pre-wrap text-sm text-red-600 dark:text-red-400"
                    role="alert"
                  >
                    {aiConfirm.error}
                  </p>
                )}
                {aiConfirm.text && (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                    {aiConfirm.text}
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        <footer className="mt-12 text-center text-xs text-gray-500 dark:text-gray-500">
          Fluxo inspirado em agendamento tipo Calendly — dados de vagas são
          exemplos; conecte a uma planilha ou API quando for integrar.
        </footer>
      </div>

      {!assistantOpen && (
        <button
          type="button"
          onClick={() => setAssistantOpen(true)}
          className="fixed bottom-5 right-5 z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg shadow-orange-600/40 ring-4 ring-orange-200/60 transition hover:bg-orange-600 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-orange-300 dark:bg-orange-500 dark:ring-orange-900/50 dark:hover:bg-orange-400"
          aria-label="Abrir assistente da escala"
        >
          <svg
            className="h-7 w-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </button>
      )}

      {assistantOpen && (
        <aside
          className="fixed bottom-0 right-0 z-[65] flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-lime-200/90 bg-gradient-to-b from-lime-50 to-lime-100/95 shadow-2xl shadow-lime-900/10 dark:border-lime-800/60 dark:from-lime-950/90 dark:to-lime-950/70 lg:bottom-auto lg:top-0 lg:max-h-none lg:h-full lg:rounded-none lg:rounded-tl-3xl lg:border-l lg:border-t-0 lg:border-r-0"
          aria-label="Assistente da escala com IA"
        >
          <div className="flex items-start justify-between gap-2 border-b border-lime-200/70 bg-white/50 px-4 py-3 dark:border-lime-800/50 dark:bg-lime-950/40">
            <div>
              <p className="text-base font-bold tracking-tight text-lime-950 dark:text-lime-100">
                Assistente da escala
              </p>
              <p className="text-[11px] font-medium text-lime-800/80 dark:text-lime-300/80">
                IA · Gemini · dúvidas e ideias
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAssistantOpen(false)}
              className="rounded-lg p-2 text-lime-800 transition hover:bg-lime-200/60 dark:text-lime-200 dark:hover:bg-lime-800/50"
              aria-label="Recolher painel"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 5l7 7-7 7M5 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>

          <div className="shrink-0 border-b border-lime-200/50 px-4 py-4 dark:border-lime-800/40">
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight text-lime-950 dark:text-lime-50">
                Oi, {assistantGreetingName.toUpperCase()}!
              </p>
              <p className="mt-0.5 text-sm text-lime-900/85 dark:text-lime-200/90">
                Como posso te ajudar hoje? Dúvidas e sugestões sobre a escala
                aparecem aqui.
              </p>
            </div>

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-lime-800/70 dark:text-lime-300/70">
              Acesso rápido
            </p>
            <div className="mt-2 flex flex-col gap-2">
              <button
                type="button"
                disabled={assistantBusy}
                onClick={() =>
                  void sendAssistantMessage(
                    "Quais sugestões práticas você dá para concluir esta escala com base nas vagas livres e no preenchimento atual? Responda de forma objetiva."
                  )
                }
                className="flex w-full items-center rounded-full border border-white/80 bg-white px-4 py-2.5 text-left text-sm font-medium text-lime-950 shadow-sm transition hover:bg-lime-50 disabled:opacity-50 dark:border-lime-800/40 dark:bg-lime-900/60 dark:text-lime-50 dark:hover:bg-lime-900"
              >
                Ideias para fechar a escala
              </button>
              <button
                type="button"
                disabled={assistantBusy}
                onClick={() =>
                  void sendAssistantMessage(
                    "Como posso priorizar o preenchimento dos turnos e salas neste mês, usando somente as vagas vazias listadas no contexto?"
                  )
                }
                className="flex w-full items-center rounded-full border border-white/80 bg-white px-4 py-2.5 text-left text-sm font-medium text-lime-950 shadow-sm transition hover:bg-lime-50 disabled:opacity-50 dark:border-lime-800/40 dark:bg-lime-900/60 dark:text-lime-50 dark:hover:bg-lime-900"
              >
                Priorizar vagas livres
              </button>
              <button
                type="button"
                disabled={assistantBusy}
                onClick={() =>
                  void sendAssistantMessage(
                    "Com base no contexto sobre nomes repetidos (se houver), o que devo revisar primeiro e quais passos você sugere?"
                  )
                }
                className="flex w-full items-center rounded-full border border-white/80 bg-white px-4 py-2.5 text-left text-sm font-medium text-lime-950 shadow-sm transition hover:bg-lime-50 disabled:opacity-50 dark:border-lime-800/40 dark:bg-lime-900/60 dark:text-lime-50 dark:hover:bg-lime-900"
              >
                Sobre nomes repetidos
              </button>
            </div>
          </div>

          <div
            ref={assistantScrollRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            {assistantChat.length === 0 && !assistantBusy && (
              <p className="rounded-2xl bg-white/70 px-3 py-2 text-xs leading-relaxed text-lime-900/80 dark:bg-lime-900/40 dark:text-lime-200/90">
                Pergunte sobre a escala de{" "}
                <span className="font-semibold">{periodLabelFull}</span> ou use
                os atalhos acima. A IA recebe um resumo real das vagas vazias e
                duplicados.
              </p>
            )}
            {assistantChat.map((turn, i) => (
              <div
                key={i}
                className={
                  turn.role === "user"
                    ? "ml-6 rounded-2xl rounded-br-md bg-white px-3 py-2 text-sm text-lime-950 shadow-sm dark:bg-lime-900/70 dark:text-lime-50"
                    : "mr-4 rounded-2xl rounded-bl-md border border-lime-200/60 bg-lime-100/80 px-3 py-2 text-sm leading-relaxed text-lime-950 dark:border-lime-700/50 dark:bg-lime-900/50 dark:text-lime-100"
                }
              >
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lime-700/70 dark:text-lime-400/80">
                  {turn.role === "user" ? "Você" : "Assistente"}
                </span>
                <p className="whitespace-pre-wrap">{turn.text}</p>
              </div>
            ))}
            {assistantBusy && (
              <p className="text-xs font-medium text-lime-800 dark:text-lime-300">
                Pensando…
              </p>
            )}
            {assistantError && (
              <div
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
                role="alert"
              >
                <p className="whitespace-pre-wrap">{assistantError}</p>
                {assistantShowRetry && assistantRetryTextRef.current && (
                  <button
                    type="button"
                    disabled={assistantBusy}
                    onClick={() =>
                      void sendAssistantMessage(
                        assistantRetryTextRef.current!,
                        "retry"
                      )
                    }
                    className="mt-2 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-800 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500"
                  >
                    Tentar de novo
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-lime-200/70 bg-white/40 p-3 dark:border-lime-800/50 dark:bg-lime-950/50">
            <label htmlFor="assistant-chat-input" className="sr-only">
              Sua pergunta para o assistente
            </label>
            <textarea
              id="assistant-chat-input"
              rows={2}
              value={assistantInput}
              onChange={(e) => setAssistantInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendAssistantMessage(assistantInput);
                }
              }}
              placeholder="Ex.: como dividir o preenchimento entre os turnos?"
              disabled={assistantBusy}
              className="w-full resize-none rounded-xl border border-lime-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-400/30 disabled:opacity-60 dark:border-lime-800 dark:bg-lime-950 dark:text-white dark:placeholder:text-lime-700"
            />
            <button
              type="button"
              disabled={assistantBusy || !assistantInput.trim()}
              onClick={() => void sendAssistantMessage(assistantInput)}
              className="mt-2 flex w-full items-center justify-center rounded-2xl border-2 border-sky-600 bg-transparent py-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-500 dark:text-sky-200 dark:hover:bg-sky-950/50"
            >
              Enviar pergunta
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}



