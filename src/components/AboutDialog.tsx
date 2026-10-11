import { ExternalLink, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { SITE } from "@/config/site";
import { useI18n } from "@/i18n";
import { Logo } from "./Logo";

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
      <ul className="about-links">
        {SITE.channels.map((c) => (
          <li key={c.name}>
            <a href={c.url} target="_blank" rel="noreferrer">
              <b>{c.name}</b> {c.handle}
              <ExternalLink size={14} aria-hidden />
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
        <li>
          <a href={SITE.github.profile} target="_blank" rel="noreferrer">
            <b>GitHub</b> @{SITE.github.user}
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
