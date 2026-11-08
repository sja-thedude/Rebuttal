import { useEffect, useRef, useState } from "react";

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Animates a number from its previous value to `target`. */
export function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(reduced() ? target : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced()) {
      setV(target);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setV(a + (target - a) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** Adds the `in` class to `.reveal` descendants as they scroll into view. */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = root.querySelectorAll<HTMLElement>(".reveal");
    if (reduced() || !("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((en) => en.isIntersecting && (en.target.classList.add("in"), io.unobserve(en.target))),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return ref;
}

export function useScrolled(px = 8) {
  const [s, setS] = useState(false);
  useEffect(() => {
    const on = () => setS(window.scrollY > px);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [px]);
  return s;
}

/** Pointer-driven polish for the landing page: card spotlights, hero tilt and a scroll progress bar. */
export function usePointerFx<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const bar = document.querySelector<HTMLElement>(".scroll-progress");
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - innerHeight;
        bar?.style.setProperty("--p", String(max > 0 ? scrollY / max : 0));
      });
    };
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    if (reduced() || !matchMedia("(pointer: fine)").matches) return () => removeEventListener("scroll", onScroll);

    const onMove = (e: PointerEvent) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>(".card.lift, .vcard, .pipe");
      if (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - r.left}px`);
        card.style.setProperty("--my", `${e.clientY - r.top}px`);
      }
      const tilt = (e.target as HTMLElement).closest<HTMLElement>(".hero-visual");
      if (tilt) {
        const r = tilt.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        tilt.style.setProperty("--rx", `${(-y * 6).toFixed(2)}deg`);
        tilt.style.setProperty("--ry", `${(x * 8).toFixed(2)}deg`);
      }
    };
    const onLeave = (e: PointerEvent) => {
      const tilt = (e.target as HTMLElement).closest?.<HTMLElement>(".hero-visual");
      if (tilt && !tilt.contains(e.relatedTarget as Node)) {
        tilt.style.setProperty("--rx", "0deg");
        tilt.style.setProperty("--ry", "0deg");
      }
    };
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerout", onLeave);
    return () => {
      removeEventListener("scroll", onScroll);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerout", onLeave);
    };
  }, [ref]);
}
