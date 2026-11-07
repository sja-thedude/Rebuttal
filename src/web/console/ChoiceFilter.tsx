import { useMemo } from "react";
import type { CustomFilterDisplayProps } from "ag-grid-react";
import type { DoesFilterPassParams } from "ag-grid-community";
import { useI18n } from "../i18n";

export interface ChoiceFilterParams {
  values: string[];
  format: (v: string) => string;
}

/**
 * A checkbox list filter for the queue's categorical columns (reason, verdict, status, stage).
 * The model is the list of values kept, or null for everything. The charts write the same model,
 * so a click on a chart and a tick in this list are the same filter.
 *
 * It runs as a filter handler (`enableFilterHandlers`), so a model set from code, such as a chart
 * click, filters the grid even if this panel has never been opened.
 */
export const choiceFilterPass = ({ model, node, handlerParams }: DoesFilterPassParams<unknown, unknown, string[] | null>) =>
  !model || model.includes(String(handlerParams.getValue(node) ?? ""));

export function ChoiceFilter(p: CustomFilterDisplayProps<unknown, unknown, string[]> & ChoiceFilterParams) {
  const { t } = useI18n();
  const { model, onModelChange, values, format } = p;

  const kept = useMemo(() => new Set(model ?? values), [model, values]);
  const toggle = (v: string) => {
    const next = new Set(kept);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onModelChange(next.size === values.length ? null : [...next]);
  };

  return (
    <div className="choice-filter" role="group">
      <label className="choice-row choice-all">
        <input type="checkbox" checked={!model} ref={(el) => {
          if (el) el.indeterminate = !!model && model.length > 0;
        }} onChange={() => onModelChange(model ? null : [])} />
        <span>{t("toolbar.filterAll")}</span>
      </label>
      {values.map((v) => (
        <label key={v} className="choice-row">
          <input type="checkbox" checked={kept.has(v)} onChange={() => toggle(v)} />
          <span dir="auto">{format(v)}</span>
        </label>
      ))}
    </div>
  );
}
