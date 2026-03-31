import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  type CalendarShiftId,
  CALENDAR_SHIFT_LABELS,
  CALENDAR_SHIFT_ORDER,
  dateKeyLocal,
  formatDateBr,
  scheduleCellKey,
} from "./may2026Schedule";

type RowDef =
  | { key: "facilitador"; label: string; type: "facilitador" }
  | { key: string; label: string; type: "sala"; auxiliares: number };

const ROWS: readonly RowDef[] = [
  { key: "facilitador", label: "FACILITADOR", type: "facilitador" },
  { key: "kids", label: "KIDS", type: "sala", auxiliares: 3 },
  { key: "super_kids", label: "SUPER KIDS", type: "sala", auxiliares: 3 },
  { key: "juniores", label: "JUNIORES", type: "sala", auxiliares: 2 },
];

function cellFacilitador(
  grid: Record<string, string>,
  shiftId: CalendarShiftId,
  dk: string
): string {
  return (grid[scheduleCellKey(shiftId, dk, "facilitador", "fac")] ?? "").trim() || "—";
}

function cellSala(
  grid: Record<string, string>,
  shiftId: CalendarShiftId,
  dk: string,
  rowKey: string,
  auxCount: number
): string {
  const tit =
    (grid[scheduleCellKey(shiftId, dk, rowKey, "tit")] ?? "").trim() || "—";
  const auxLines: string[] = [];
  for (let i = 0; i < auxCount; i++) {
    const v =
      (grid[scheduleCellKey(shiftId, dk, rowKey, `aux${i}`)] ?? "").trim() ||
      "—";
    auxLines.push(`Aux${i + 1}: ${v}`);
  }
  return `Tit: ${tit}\n${auxLines.join("\n")}`;
}

function monthTitlePt(year: number, month1to12: number): string {
  const months = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  return `${months[month1to12 - 1]} de ${year}`;
}

export function buildSchedulePlainText(
  grid: Record<string, string>,
  sundays: readonly Date[],
  year: number,
  month1to12: number
): string {
  const title = `Escala de voluntários — domingos de ${monthTitlePt(year, month1to12)}`;
  const lines: string[] = [title, `Gerado em ${new Date().toLocaleString("pt-BR")}`, ""];
  if (sundays.length === 0) {
    lines.push("(Não há domingos neste mês.)");
    return lines.join("\n");
  }

  for (const shiftId of CALENDAR_SHIFT_ORDER) {
    const shiftName = CALENDAR_SHIFT_LABELS[shiftId];
    lines.push("═".repeat(60));
    lines.push(shiftName);
    lines.push("─".repeat(60));
    for (const row of ROWS) {
      lines.push(`\n${row.label}`);
      for (const d of sundays) {
        const dk = dateKeyLocal(d);
        const dom = `Dom ${formatDateBr(d)}`;
        if (row.type === "facilitador") {
          lines.push(`  ${dom}: ${cellFacilitador(grid, shiftId, dk)}`);
        } else {
          const block = cellSala(grid, shiftId, dk, row.key, row.auxiliares);
          lines.push(`  ${dom}:`);
          for (const ln of block.split("\n")) {
            lines.push(`    ${ln}`);
          }
        }
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function buildScheduleCsv(
  grid: Record<string, string>,
  sundays: readonly Date[],
  year: number,
  month1to12: number
): string {
  const sep = ";";
  const header = [
    "Turno",
    "Função_ou_Sala",
    "Data",
    "Papel",
    "Nome",
  ].join(sep);
  const rows: string[] = [header];

  function esc(s: string): string {
    const t = s.replace(/"/g, '""');
    if (/[;\n\r"]/.test(t)) return `"${t}"`;
    return t;
  }

  for (const shiftId of CALENDAR_SHIFT_ORDER) {
    const turno = CALENDAR_SHIFT_LABELS[shiftId];
    for (const d of sundays) {
      const dk = dateKeyLocal(d);
      const data = `${String(d.getDate()).padStart(2, "0")}/${String(month1to12).padStart(2, "0")}/${year}`;
      rows.push(
        [turno, "FACILITADOR", data, "Facilitador", esc(cellFacilitador(grid, shiftId, dk))].join(
          sep
        )
      );
      for (const row of ROWS) {
        if (row.type === "facilitador") continue;
        const tit =
          (grid[scheduleCellKey(shiftId, dk, row.key, "tit")] ?? "").trim();
        rows.push(
          [turno, row.label, data, "Titular", esc(tit || "—")].join(sep)
        );
        for (let i = 0; i < row.auxiliares; i++) {
          const v =
            (grid[scheduleCellKey(shiftId, dk, row.key, `aux${i}`)] ?? "").trim();
          rows.push(
            [
              turno,
              row.label,
              data,
              `Auxiliar ${i + 1}`,
              esc(v || "—"),
            ].join(sep)
          );
        }
      }
    }
  }

  return rows.join("\r\n");
}

export function downloadSchedulePdf(
  grid: Record<string, string>,
  sundays: readonly Date[],
  year: number,
  month1to12: number,
  filename = "escala-voluntarios.pdf"
): void {
  const doc = new jsPDF({
    orientation: sundays.length > 4 ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });
  const margin = 12;
  let y = margin;

  doc.setFontSize(14);
  doc.text(
    `Escala — domingos de ${monthTitlePt(year, month1to12)}`,
    margin,
    y
  );
  y += 8;
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, margin, y);
  doc.setTextColor(0);
  y += 10;

  if (sundays.length === 0) {
    doc.text("Não há domingos neste mês.", margin, y);
    doc.save(filename);
    return;
  }

  const head = [
    "Função / Sala",
    ...sundays.map((d) => `Dom ${formatDateBr(d)}`),
  ];

  for (const shiftId of CALENDAR_SHIFT_ORDER) {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = margin;
    }

    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text(CALENDAR_SHIFT_LABELS[shiftId], margin, y);
    y += 6;

    const body: string[][] = [];
    for (const row of ROWS) {
      const line: string[] = [row.label];
      for (const d of sundays) {
        const dk = dateKeyLocal(d);
        if (row.type === "facilitador") {
          line.push(cellFacilitador(grid, shiftId, dk));
        } else {
          line.push(cellSala(grid, shiftId, dk, row.key, row.auxiliares));
        }
      }
      body.push(line);
    }

    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
      headStyles: { fillColor: [16, 185, 129] },
      columnStyles: {
        0: { cellWidth: 28 },
      },
      margin: { left: margin, right: margin },
    });

    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } })
      .lastAutoTable?.finalY;
    y = (finalY ?? y) + 12;
  }

  doc.save(filename);
}

export function triggerDownloadText(
  content: string,
  filename: string,
  mime: string
): void {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
