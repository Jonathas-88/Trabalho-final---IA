import { useEffect, useMemo, useState } from "react";
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
  MAY_2026_SUNDAYS,
  formatDateBr,
  dateKeyLocal,
  scheduleCellKey,
  type CalendarShiftId,
  loadScheduleGridFromStorage,
  saveScheduleGridToStorage,
  findFirstMatchingEmptySlot,
  listEmptySlotsMatchingFilters,
  listEmptySlots,
  formatDescriptorLine,
} from "../lib/may2026Schedule";

type AiPanel = { text: string | null; error: string | null; loading: boolean };

const idleAi: AiPanel = { text: null, error: null, loading: false };

type RoomRow =
  | { key: "facilitador"; label: string; type: "facilitador" }
  | { key: string; label: string; type: "sala"; auxiliares: number };

const CALENDAR_ROWS: readonly RoomRow[] = [
  { key: "facilitador", label: "FACILITADOR", type: "facilitador" },
  { key: "kids", label: "KIDS", type: "sala", auxiliares: 3 },
  { key: "super_kids", label: "SUPER KIDS", type: "sala", auxiliares: 3 },
  { key: "juniores", label: "JUNIORES", type: "sala", auxiliares: 2 },
];

const inputSlotClass =
  "w-full min-w-0 rounded-md border border-gray-200/90 bg-white px-1.5 py-1 text-xs text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 dark:border-gray-600 dark:bg-gray-900/70 dark:text-white dark:placeholder:text-gray-500";

function ShiftScheduleTable(props: {
  shiftId: CalendarShiftId;
  shiftLabel: string;
  headerClass: string;
  values: Record<string, string>;
  onCellChange: (key: string, value: string) => void;
}) {
  const { shiftId, shiftLabel, headerClass, values, onCellChange } = props;
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm dark:border-gray-700">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr>
            <th
              colSpan={MAY_2026_SUNDAYS.length + 1}
              className={`px-3 py-2 text-center text-xs font-bold uppercase tracking-wide text-white ${headerClass}`}
            >
              {shiftLabel}
            </th>
          </tr>
          <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-800/80">
            <th className="w-36 border-r border-gray-200 px-2 py-2 text-xs font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200">
              Função / Sala
            </th>
            {MAY_2026_SUNDAYS.map((d) => (
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
              {MAY_2026_SUNDAYS.map((d) => {
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
                          className={inputSlotClass}
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
                            className={`mt-0.5 ${inputSlotClass}`}
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
                                className={`mt-0.5 ${inputSlotClass}`}
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

function backendBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.replace(/\/$/, "");
  }
  return "http://localhost:3002";
}

async function postGemini(
  setState: React.Dispatch<React.SetStateAction<AiPanel>>,
  body: Record<string, unknown>
) {
  setState({ text: null, error: null, loading: true });
  try {
    const res = await fetch(`${backendBaseUrl()}/api/gemini-suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as {
      suggestion?: string;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error ?? res.statusText);
    }
    if (data.suggestion) {
      setState({ text: data.suggestion, error: null, loading: false });
    } else {
      throw new Error("Resposta sem texto");
    }
  } catch (err) {
    setState({
      text: null,
      error: err instanceof Error ? err.message : "Falha na requisição",
      loading: false,
    });
  }
}

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
  const [scheduleGrid, setScheduleGrid] = useState<Record<string, string>>(
    loadScheduleGridFromStorage
  );
  const [placementSuccess, setPlacementSuccess] = useState<string | null>(null);
  const [placementVacancies, setPlacementVacancies] = useState<{
    title: string;
    lines: string[];
  } | null>(null);

  useEffect(() => {
    saveScheduleGridToStorage(scheduleGrid);
  }, [scheduleGrid]);

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
      month: "2026-05",
      sundaysDomingo: true,
      grid: scheduleGrid,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = "escala-voluntarios-maio-2026.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleEncaixarNaTabela() {
    setPlacementSuccess(null);
    setPlacementVacancies(null);
    const trimmed = name.trim();
    if (!trimmed) {
      window.alert("Informe o nome do voluntário.");
      return;
    }
    if (!days.has("dom")) {
      window.alert(
        'A tabela de maio de 2026 usa apenas domingos. Marque "Domingo" em Dias para encaixar automaticamente.'
      );
      return;
    }
    if (shifts.size === 0) {
      window.alert("Selecione ao menos um turno.");
      return;
    }
    if (roles.size === 0) {
      window.alert("Selecione ao menos uma função.");
      return;
    }
    if (needsRoomForGrid && extraRoles.size === 0) {
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
      placementConstraints
    );

    if (found) {
      setScheduleGrid((prev) => ({ ...prev, [found.key]: trimmed }));
      setPlacementSuccess(
        `${trimmed} foi encaixado(a) em: ${found.label}. A escala acumula cada nome e já foi salva neste navegador.`
      );
      return;
    }

    const matchingFree = listEmptySlotsMatchingFilters(
      scheduleGrid,
      placementConstraints
    );
    const lines =
      matchingFree.length > 0
        ? matchingFree.map(formatDescriptorLine)
        : listEmptySlots(scheduleGrid).map(formatDescriptorLine);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/80 dark:from-gray-950 dark:via-gray-900 dark:to-emerald-950/40">
      <div className="mx-auto max-w-3xl px-4 pt-12 sm:pt-16">
        <header className="mb-10 text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Agendamento de voluntários
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
            Escolha quando e como ajudar
          </h1>
          <p className="mt-3 text-balance text-gray-600 dark:text-gray-400">
            Informe seu nome e em quais dias, turnos e funções você pode atuar.
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
                Para encaixar na tabela de maio/2026, inclua{" "}
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Domingo
                </span>{" "}
                (só há colunas para os domingos do mês).
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
                disabled={!canEncaixarNaTabela}
                title={
                  !days.has("dom")
                    ? 'Marque "Domingo" para usar a escala de maio/2026'
                    : undefined
                }
                className="inline-flex items-center justify-center rounded-xl border-2 border-emerald-600/50 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/60"
              >
                Encaixar na tabela
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
              está preenchido e fica salvo no navegador.
            </p>
          </div>
        </form>
      </div>

        <section
          className="mx-auto mt-12 max-w-6xl px-4 sm:px-6"
          aria-labelledby="calendario-vagas-titulo"
        >
          <h2
            id="calendario-vagas-titulo"
            className="text-center text-lg font-semibold text-gray-900 dark:text-white"
          >
            Calendário de vagas — domingos de maio de 2026
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-gray-600 dark:text-gray-400">
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
            — 3 em Kids e Super Kids, 2 em Juniores.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={exportScheduleJson}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              Exportar JSON
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Inclui todos os nomes da grade + data da exportação. A escala também
              permanece salva neste navegador (localStorage).
            </span>
          </div>
          {placementSuccess && (
            <div
              className="mx-auto mt-4 max-w-2xl rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
              role="status"
            >
              {placementSuccess}
            </div>
          )}
          {placementVacancies && placementVacancies.lines.length > 0 && (
            <div
              className="mx-auto mt-4 max-w-3xl rounded-xl border border-amber-200 bg-amber-50/90 p-4 dark:border-amber-900/50 dark:bg-amber-950/30"
              role="region"
              aria-label="Vagas livres para preenchimento manual"
            >
              <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
                {placementVacancies.title}
              </p>
              <ul className="mt-2 max-h-56 list-inside list-disc overflow-y-auto text-xs text-amber-900 dark:text-amber-200/95 sm:text-sm">
                {placementVacancies.lines.map((line, i) => (
                  <li key={`${line}-${i}`} className="py-0.5">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-6 space-y-8">
            <ShiftScheduleTable
              shiftId="manha"
              shiftLabel="MANHÃ"
              headerClass="bg-amber-600 dark:bg-amber-700"
              values={scheduleGrid}
              onCellChange={(key, value) =>
                setScheduleGrid((prev) => ({ ...prev, [key]: value }))
              }
            />
            <ShiftScheduleTable
              shiftId="tarde"
              shiftLabel="TARDE"
              headerClass="bg-blue-600 dark:bg-blue-700"
              values={scheduleGrid}
              onCellChange={(key, value) =>
                setScheduleGrid((prev) => ({ ...prev, [key]: value }))
              }
            />
            <ShiftScheduleTable
              shiftId="noite"
              shiftLabel="NOITE"
              headerClass="bg-violet-900 dark:bg-violet-950"
              values={scheduleGrid}
              onCellChange={(key, value) =>
                setScheduleGrid((prev) => ({ ...prev, [key]: value }))
              }
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
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
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
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
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
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
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
    </div>
  );
}



