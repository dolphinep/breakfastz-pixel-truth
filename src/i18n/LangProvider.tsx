import { useEffect, useMemo, useState, type ReactNode } from "react";
import { I18n, readLang, translate, type Ctx, type Lang } from "./index";

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang: (l) => {
        setLangState(l);
        try {
          localStorage.setItem("pixel-truth-lang", l);
        } catch {
          /* storage blocked — that's fine */
        }
      },
      t: (k, vars) => translate(lang, k, vars),
    }),
    [lang],
  );
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}
