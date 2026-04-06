const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY não configurada no servidor.");
  }

  // IDs mudam; 1.5 deixou de existir no v1beta para muitas contas. Estável atual: 2.5 Flash.
  // Liste os disponíveis: GET .../v1beta/models?key=SUA_CHAVE
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const url = `${GEMINI_BASE}/${model}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 512,
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    let detail = errBody.slice(0, 400);
    try {
      const j = JSON.parse(errBody);
      const apiErr = j?.error;
      if (apiErr && typeof apiErr === "object") {
        const m = apiErr.message;
        const c = apiErr.code;
        if (typeof m === "string" && m.trim()) {
          detail = c ? `${c}: ${m}` : m;
        }
      }
    } catch {
      /* manter detail como texto bruto */
    }
    const baseMessage = `Gemini HTTP ${res.status}: ${detail}`;
    let message = baseMessage;
    if (res.status === 429) {
      message =
        "Gemini HTTP 429: quota/limites do modelo ou do projeto. Confira GEMINI_MODEL e o painel de cotas. Aguarde reset, reduza chamadas ou configure faturamento.";
    } else if (res.status === 404) {
      message =
        'Gemini HTTP 404: modelo inexistente ou não suportado em generateContent (ex.: "gemini-1.5-flash" foi descontinuado). Defina GEMINI_MODEL=gemini-2.5-flash ou veja GET /v1beta/models na documentação.';
    }
    const error = new Error(message);
    /** @type {Error & { status?: number }} */ (error).status = res.status;
    throw error;
  }

  /** @type {{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }} */
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) {
    throw new Error("Resposta vazia do modelo.");
  }
  return text;
}
