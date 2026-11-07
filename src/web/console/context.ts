import { createContext, useContext } from "react";
import type { CaseFile } from "../../shared/types";
import type { Mode } from "../api";

export interface ConsoleApi {
  mode: Mode;
  model: string | null;
  onCaseChanged: (id: string, c: CaseFile) => void;
  rerun: (id: string) => void;
  expanded: ReadonlySet<string>;
  toggleRow: (id: string, open?: boolean) => void;
}

export const ConsoleCtx = createContext<ConsoleApi | null>(null);
export const useConsole = () => {
  const v = useContext(ConsoleCtx);
  if (!v) throw new Error("useConsole outside provider");
  return v;
};
