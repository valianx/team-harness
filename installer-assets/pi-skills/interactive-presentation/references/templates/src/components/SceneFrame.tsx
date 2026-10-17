import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { SceneData } from "../types";
import flowStyles from "@xyflow/react/dist/style.css?inline";
import styles from "../styles/globals.css?inline";

const contentStyles = `${flowStyles}\n${styles}`;

function fragmentTarget(root: ShadowRoot, hash: string): Element | null {
  try { return hash ? root.getElementById(decodeURIComponent(hash.slice(1))) : null; }
  catch { return null; }
}

function revealFragment(root: ShadowRoot, hash: string) {
  const target = fragmentTarget(root, hash);
  if (!target) return;
  target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
  if (target instanceof HTMLElement || target instanceof SVGElement) {
    target.focus({ preventScroll: true });
    if (root.activeElement !== target && !target.hasAttribute("tabindex")) {
      target.setAttribute("tabindex", "-1");
      target.addEventListener("blur", () => {
        if (target.getAttribute("tabindex") === "-1") target.removeAttribute("tabindex");
      }, { once: true });
      target.focus({ preventScroll: true });
    }
  }
}

function followFragment(event: MouseEvent<HTMLDivElement>) {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  const root = event.currentTarget.getRootNode();
  const anchor = event.nativeEvent.composedPath().find((entry): entry is Element =>
    entry instanceof Element && entry.matches("a[href]"));
  if (!(root instanceof ShadowRoot) || !anchor || anchor.getRootNode() !== root || anchor.hasAttribute("download")) return;
  const target = anchor.getAttribute("target");
  if (target && target.toLowerCase() !== "_self") return;
  let url: URL;
  try { url = new URL(anchor.getAttribute("href")!, document.baseURI); }
  catch { return; }
  if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search || !fragmentTarget(root, url.hash)) return;
  event.preventDefault();
  location.hash = url.hash;
  revealFragment(root, url.hash);
}

/** One headline and one measured content region share the reserved audience stage. */
export function SceneFrame({ scene, children }: { scene: SceneData; children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  useLayoutEffect(() => {
    if (!host.current) return;
    const contentRoot = host.current.shadowRoot ?? host.current.attachShadow({ mode: "open" });
    const stylesheet = document.createElement("style");
    stylesheet.textContent = contentStyles;
    contentRoot.append(stylesheet);
    setRoot(contentRoot);
    return () => stylesheet.remove();
  }, []);
  useEffect(() => {
    if (!root) return;
    const update = () => revealFragment(root, location.hash);
    window.addEventListener("hashchange", update);
    update();
    return () => window.removeEventListener("hashchange", update);
  }, [root]);

  return (
    <article className="scene-frame" data-stage-safe-area data-scene-id={scene.id} aria-label={scene.title}
      data-heading-embedded={scene.showHeading === false}>
      {scene.showHeading !== false && <header className="scene-heading">
        <h2 className="scene-title">{scene.title}</h2>
        {scene.subtitle && <p className="scene-subtitle">{scene.subtitle}</p>}
      </header>}
      <div ref={host} className="scene-content" data-scene-content />
      {root && createPortal(<div className="presentation-content" onClick={followFragment}>{children}</div>, root)}
    </article>
  );
}
