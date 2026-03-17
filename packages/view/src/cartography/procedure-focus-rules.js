import { deriveProcedureDisplay } from "./style-system.js";

function normalizeText(value) {
  return String(value ?? "").trim();
}

function addIfPresent(set, value) {
  const text = normalizeText(value);
  if (text) set.add(text);
}

export function createProcedureFocusContext(features = [], selectedProcedureKey = "all") {
  const selectedKey = String(selectedProcedureKey || "all");
  const focus = {
    selectedKey,
    selected: selectedKey !== "all",
    airport: null,
    runway: null,
    transition: null,
    fixIdents: new Set()
  };
  if (!focus.selected) return focus;

  for (const feature of features ?? []) {
    const props = feature?.properties ?? feature ?? {};
    const meta = deriveProcedureDisplay(props);
    if (meta.key !== selectedKey) continue;
    focus.airport ||= meta.airport || null;
    focus.runway ||= meta.runway || null;
    focus.transition ||= meta.transition || null;
    addIfPresent(focus.fixIdents, props.fixIdent);
    addIfPresent(focus.fixIdents, props.fixId);
    addIfPresent(focus.fixIdents, props.ident);
  }
  return focus;
}
