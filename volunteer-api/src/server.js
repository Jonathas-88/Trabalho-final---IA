import "dotenv/config";
import express from "express";
import cors from "cors";
import {
  buildPrompt,
  buildNoMatchPrompt,
  buildSlotConfirmPrompt,
  buildScheduleDuplicatesPrompt,
} from "./prompt.js";
import { callGemini } from "./gemini.js";

const app = express();
const PORT = Number(process.env.PORT) || 3002;

const defaultOrigins =
  "http://localhost:5173,http://127.0.0.1:5173";

app.use(
  cors({
    origin:
      process.env.CORS_ORIGIN === "*"
        ? true
        : (process.env.CORS_ORIGIN ?? defaultOrigins).split(","),
  })
);
app.use(express.json());

/**
 * @param {Record<string, unknown>} body
 * @returns {"matched_summary" | "no_match_hint" | "slot_confirm" | "schedule_duplicates"}
 */
function resolveKind(body) {
  const raw =
    typeof body.kind === "string" ? body.kind.trim().toLowerCase() : "";
  if (
    raw === "no_match_hint" ||
    raw === "slot_confirm" ||
    raw === "matched_summary" ||
    raw === "schedule_duplicates"
  ) {
    return raw;
  }

  const matchedSlots = Array.isArray(body.matchedSlots)
    ? body.matchedSlots
    : [];
  const openCatalog = Array.isArray(body.openCatalog) ? body.openCatalog : [];
  const slot = body.slot;

  if (slot && typeof slot === "object" && !Array.isArray(slot)) {
    const s = /** @type {{ day?: unknown; shift?: unknown; role?: unknown }} */ (
      slot
    );
    const day = typeof s.day === "string" ? s.day.trim() : "";
    const shift = typeof s.shift === "string" ? s.shift.trim() : "";
    const role = typeof s.role === "string" ? s.role.trim() : "";
    if (day && shift && role) return "slot_confirm";
  }

  if (openCatalog.length > 0 && matchedSlots.length === 0) {
    return "no_match_hint";
  }

  return "matched_summary";
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "volunteer-api" });
});

app.post("/api/gemini-suggest", async (req, res) => {
  const body = req.body ?? {};
  const kind = resolveKind(body);

  const volunteerName =
    typeof body.volunteerName === "string" ? body.volunteerName.trim() : "";
  const days = Array.isArray(body.days) ? body.days : [];
  const shifts = Array.isArray(body.shifts) ? body.shifts : [];
  const roles = Array.isArray(body.roles) ? body.roles : [];

  if (kind !== "schedule_duplicates" && !volunteerName) {
    res.status(400).json({ error: "volunteerName é obrigatório" });
    return;
  }

  /** @type {string} */
  let prompt;
  if (kind === "schedule_duplicates") {
    const duplicates = Array.isArray(body.duplicates) ? body.duplicates : [];
    if (duplicates.length === 0) {
      res.status(400).json({ error: "duplicates não pode ser vazio neste modo" });
      return;
    }
    const periodLabel =
      typeof body.periodLabel === "string" && body.periodLabel.trim()
        ? body.periodLabel.trim()
        : "período atual";
    const emptySlots = Array.isArray(body.emptySlotLabels)
      ? body.emptySlotLabels.filter((x) => typeof x === "string")
      : [];
    const normalized = duplicates
      .map((d) => {
        const name = typeof d?.name === "string" ? d.name.trim() : "";
        const placements = Array.isArray(d?.placements)
          ? d.placements.filter((p) => typeof p === "string")
          : [];
        return name && placements.length > 0 ? { name, placements } : null;
      })
      .filter(Boolean);
    if (normalized.length === 0) {
      res.status(400).json({ error: "duplicates inválido (name e placements)" });
      return;
    }
    prompt = buildScheduleDuplicatesPrompt(periodLabel, normalized, emptySlots);
  } else if (kind === "matched_summary") {
    const matchedSlots = Array.isArray(body.matchedSlots)
      ? body.matchedSlots
      : [];
    if (matchedSlots.length === 0) {
      res
        .status(400)
        .json({ error: "matchedSlots não pode ser vazio para este modo" });
      return;
    }
    prompt = buildPrompt(volunteerName, days, shifts, roles, matchedSlots);
  } else if (kind === "no_match_hint") {
    const openCatalog = Array.isArray(body.openCatalog) ? body.openCatalog : [];
    if (openCatalog.length === 0) {
      res.status(400).json({ error: "openCatalog não pode ser vazio" });
      return;
    }
    prompt = buildNoMatchPrompt(
      volunteerName,
      days,
      shifts,
      roles,
      openCatalog
    );
  } else {
    const slot = body.slot;
    if (!slot || typeof slot !== "object") {
      res.status(400).json({ error: "slot é obrigatório para confirmação" });
      return;
    }
    const day = typeof slot.day === "string" ? slot.day : "";
    const shift = typeof slot.shift === "string" ? slot.shift : "";
    const role = typeof slot.role === "string" ? slot.role : "";
    if (!day || !shift || !role) {
      res.status(400).json({ error: "slot.day, slot.shift e slot.role são obrigatórios" });
      return;
    }
    prompt = buildSlotConfirmPrompt(volunteerName, { day, shift, role });
  }

  try {
    const suggestion = await callGemini(prompt);
    res.json({ suggestion });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao chamar Gemini";
    const typed = /** @type {Error & { status?: number }} */ (e);
    const status =
      typed.status ??
      (message.includes("GEMINI_API_KEY")
        ? 503
        : message.includes("HTTP 429")
          ? 429
          : 502);
    res.status(status).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`volunteer-api em http://localhost:${PORT}`);
  console.log(
    `  POST /api/gemini-suggest (kind: matched_summary | no_match_hint | slot_confirm | schedule_duplicates)`
  );
});
