import { Sparkles, Upload } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useI18n } from "@/i18n";

type Props = {
  onHome: () => void;
  onPrompts: () => void;
  onOpenFile: (file: File) => void;
};

/** Logo/title (home link), language switch, AI prompts and Open image. */
export function Header({ onHome, onPrompts, onOpenFile }: Props) {
  const { t, lang, setLang } = useI18n();
  return (
    <header className="top">
      <a
        className="home"
        href="./"
        aria-label={`Pixel Truth — ${t("home")}`}
        onClick={(e) => {
          e.preventDefault();
          onHome();
        }}
      >
        <Logo />
        <div className="title">
          <h1>Pixel Truth</h1>
          <p>{t("tagline")}</p>
        </div>
      </a>
      <div className="top-actions">
        <button className="lang-btn" aria-label={t("langSwitch")} data-tip={t("langSwitch")} onClick={() => setLang(lang === "en" ? "th" : "en")}>
          {lang.toUpperCase()}
        </button>
        <button className="btn" data-tip={t("promptsTip")} onClick={onPrompts}>
          <Sparkles size={18} aria-hidden />
          {t("prompts")}
        </button>
        <label className="btn primary" data-tip={t("openTip")}>
          <Upload size={18} aria-hidden />
          {t("open")}
          <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onOpenFile(e.target.files[0])} />
        </label>
      </div>
    </header>
  );
}
