// ui/diagnostics/DiagnosticsPanel.tsx — Compatibilité de l'écran : ce qui n'a pas pu
// être importé, et pourquoi. Aucune donnée personnelle (messages produits par le BFF).

import type { Diagnostic } from "@leila/ui-schema";
import { useState } from "react";

const SEVERITY: Record<Diagnostic["severity"], string> = { blocking: "Bloquant", warning: "Attention", info: "Info" };

export function DiagnosticsPanel({ diagnostics }: { diagnostics: Diagnostic[] }) {
  const [open, setOpen] = useState(false);
  if (diagnostics.length === 0) return null;
  const blocking = diagnostics.filter((d) => d.severity !== "info").length;
  // Emplacements fournis seulement en mode diagnostic (administrateur technique, développement)
  const detailed = diagnostics.some((d) => d.path !== "");
  return (
    <section className="ui-diagnostics">
      <button type="button" className="link" aria-expanded={open} onClick={() => setOpen(!open)}>
        Compatibilité : {diagnostics.length} élément{diagnostics.length > 1 ? "s" : ""} non pris en charge
        {blocking ? ` (dont ${blocking} à traiter)` : ""}
      </button>
      {open && (
        <table className="grid ui-diagnostics__table">
          <thead>
            <tr>
              <th>Niveau</th>
              <th>Code</th>
              {detailed && <th>Emplacement</th>}
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {diagnostics.map((d, i) => (
              <tr key={i} className={`is-${d.severity}`}>
                <td>{SEVERITY[d.severity]}</td>
                <td>
                  <code>{d.code}</code>
                </td>
                {detailed && (
                  <td>
                    <code>{d.path}</code>
                  </td>
                )}
                <td>{d.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
