import { Box, Clapperboard, Gamepad2 } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import type { Pixels } from "@/lib/pixel/image";
import { useI18n } from "@/i18n";
import { makeAnimations } from "@/lib/life/animate";
import { toSprite } from "@/lib/life/prepare";
import { AnimateView } from "./AnimateView";
import { PlayView } from "./PlayView";

// Three.js is heavy → split into its own chunk, loaded when the 3D tab opens
const VoxelView = lazy(() => import("./VoxelView").then((m) => ({ default: m.VoxelView })));

type Tab = "animate" | "3d" | "play";

/** Sprite to Life: animate the pixel art result / turn it into 3D / play it as a game */
export function LifePanel({ pixels, baseName }: { pixels: Pixels; baseName: string }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("animate");
  const sprite = useMemo(() => toSprite(pixels), [pixels]);
  const anims = useMemo(() => makeAnimations(sprite), [sprite]);
  const tabs = [
    { id: "animate" as const, label: t("tabAnimate"), Icon: Clapperboard },
    { id: "3d" as const, label: t("tab3d"), Icon: Box },
    { id: "play" as const, label: t("tabPlay"), Icon: Gamepad2 },
  ];
  return (
    <section className="panel life" aria-labelledby="life-title">
      <div className="life-head">
        <div>
          <h2 id="life-title">{t("lifeTitle")}</h2>
          <p className="muted">{t("lifeSub")}</p>
        </div>
        <div className="life-tabs" role="tablist" aria-label={t("lifeTitle")}>
          {tabs.map(({ id, label, Icon }) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
              <Icon size={20} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel">
        {tab === "animate" && <AnimateView anims={anims} eyes={anims.eyes.length} baseName={baseName} />}
        {tab === "3d" && (
          <Suspense fallback={<div className="life-stage voxel" />}>
            <VoxelView sprite={sprite} baseName={baseName} />
          </Suspense>
        )}
        {tab === "play" && <PlayView anims={anims} />}
      </div>
    </section>
  );
}
