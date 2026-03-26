import { useMemo, useState } from "react";
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
} from "../lib/volunteer-scheduling";

type AiPanel = { text: string | null; error: string | null; loading: boolean };

const idleAi: AiPanel = { text: null, error: null, loading: false };

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
  const [submitted, setSubmitted] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<AiPanel>(idleAi);
  const [aiNoMatch, setAiNoMatch] = useState<AiPanel>(idleAi);
  const [aiConfirm, setAiConfirm] = useState<AiPanel>(idleAi);

  const constraints: VolunteerConstraints = useMemo(
    () => ({
      name: name.trim(),
      days: [...days],
      shifts: [...shifts],
      roles: [...roles],
    }),
    [name, days, shifts, roles]
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
      <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
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
                placeholder="Ex.: Maria Silva"
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
                Dias disponíveis
              </legend>
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
                Turnos disponíveis
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
                Função
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

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-600"
              >
                Ver dias e horários compatíveis
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
          </div>
        </form>

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
