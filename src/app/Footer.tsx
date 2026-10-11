import { Info } from "lucide-react";
import { SITE } from "@/config/site";
import { useI18n } from "@/i18n";

/** "by breakfastz" credit, About and the GitHub profile. */
export function Footer({ onAbout }: { onAbout: () => void }) {
  const { t } = useI18n();
  return (
    <footer>
      <span>
        Pixel Truth · {t("aboutBy")} <b>{SITE.brand}</b> · {SITE.episode}
      </span>
      <button className="link-btn" onClick={onAbout}>
        <Info size={14} aria-hidden />
        {t("about")}
      </button>
      <a href={SITE.github.profile} target="_blank" rel="noreferrer">
        GitHub @{SITE.github.user}
      </a>
    </footer>
  );
}
