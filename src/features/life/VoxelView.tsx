import { Box } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Pixels } from "@/lib/pixel/image";
import { useI18n } from "@/i18n";
import { voxelMesh } from "@/lib/life/mesh";
import { toVoxels } from "@/lib/life/voxel";
import { download } from "./exporters";

type Three = typeof import("three");

/** Rotatable 3D voxel model — Three.js is loaded only when this tab opens */
export function VoxelView({ sprite, baseName }: { sprite: Pixels; baseName: string }) {
  const { t } = useI18n();
  const [depth, setDepth] = useState(3);
  const wrap = useRef<HTMLDivElement>(null);
  const meshRef = useRef<{ THREE: Three; mesh: import("three").Mesh } | null>(null);
  const vox = useMemo(() => toVoxels(sprite, depth), [sprite, depth]);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const el = wrap.current;
      if (!el || disposed) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.setSize(w, h);
      renderer.domElement.setAttribute("role", "img");
      renderer.domElement.setAttribute("aria-label", "3D voxel model");
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 2000);
      const size = Math.max(sprite.w, sprite.h);
      camera.position.set(size * 0.9, size * 0.5, size * 1.7);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8a6a4f, 2.2));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(1, 2, 1.5);
      scene.add(sun);
      const m = voxelMesh(vox);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(m.colors, 3));
      geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
      mesh.name = baseName;
      scene.add(mesh);
      meshRef.current = { THREE, mesh };
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 2.4;
      let raf = 0;
      const loop = () => {
        controls.update();
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      loop();
      el.dataset.ready = "1";
      cleanup = () => {
        cancelAnimationFrame(raf);
        controls.dispose();
        geo.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        delete el.dataset.ready;
      };
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [vox, sprite, baseName]);

  const exportGlb = async () => {
    const cur = meshRef.current;
    if (!cur) return;
    const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
    const scene = new cur.THREE.Scene();
    scene.add(cur.mesh.clone());
    const result = await new GLTFExporter().parseAsync(scene, { binary: true });
    download(new Blob([result as ArrayBuffer], { type: "model/gltf-binary" }), `${baseName}.glb`);
  };

  return (
    <div className="life-animate">
      <div className="life-stage voxel" ref={wrap} />
      <div className="life-side">
        <label className="field" data-tip={t("depthTip")}>
          {t("depth")} {depth}
          <input type="range" min={1} max={6} value={depth} onChange={(e) => setDepth(+e.target.value)} />
        </label>
        <p className="muted">
          {t("voxelCount", { n: vox.length.toLocaleString() })} · {t("drag3d")}
        </p>
        <div className="export">
          <button className="btn primary" data-tip={t("exportGlbTip")} onClick={exportGlb}>
            <Box size={18} aria-hidden />
            {t("exportGlb")}
          </button>
        </div>
      </div>
    </div>
  );
}
