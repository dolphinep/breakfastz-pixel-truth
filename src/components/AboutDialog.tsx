import { ExternalLink, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { SITE } from "@/config/site";
import { useI18n } from "@/i18n";
import { Logo } from "./Logo";

/** Brand logo from simple-icons (CC0). */
const Brand = ({ path }: { path: string }) => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d={path} />
  </svg>
);

/** Who made this: the breakfastz channel, its socials and the source code. */
export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
    if (!open && d?.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="about" aria-labelledby="about-title" onClose={onClose}>
      <button className="icon-btn about-close" aria-label={t("close")} onClick={onClose}>
        <X size={20} aria-hidden />
      </button>
      <div className="about-head">
        <Logo size={72} />
        <div>
          <h2 id="about-title">
            {t("aboutBy")} <span className="brand">{SITE.brand}</span>
          </h2>
          <p className="muted">
            {t("footer")}
          </p>
        </div>
      </div>
      <p>{t("aboutBody")}</p>
      <h3>{t("aboutFollow")}</h3>
      <ul className="about-icons">
        {[...SITE.channels, { name: "GitHub", handle: `@${SITE.github.user}`, url: SITE.github.profile, icon: SITE.github.icon }].map((c) => (
          <li key={c.name}>
            <a href={c.url} target="_blank" rel="noreferrer" aria-label={`${c.name} ${c.handle}`} data-tip={`${c.name} ${c.handle}`}>
              <Brand path={c.icon.path} />
            </a>
          </li>
        ))}
      </ul>
      <h3>{t("aboutCode")}</h3>
      <ul className="about-links">
        <li>
          <a href={SITE.github.repo} target="_blank" rel="noreferrer">
            <b>GitHub</b> {t("aboutRepo")}
            <ExternalLink size={14} aria-hidden />
          </a>
        </li>
      </ul>
      <p className="about-privacy">
        <ShieldCheck size={16} aria-hidden />
        {t("aboutPrivacy")}
      </p>
    </dialog>
  );
}
