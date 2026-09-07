"use client";

import { useLayoutEffect, useRef } from "react";
import { animate } from "framer-motion";
import type { NumsolisAnimation as AnimationPlan } from "@/stores/numsolis-store";

/** Presentation only: the store already owns the final board and score. */
export function NumsolisAnimation({ plan, onComplete }: { plan: AnimationPlan; onComplete: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = ref.current!;
    let cancelled = false;
    const controls = new Set<ReturnType<typeof animate>>();
    const finish = () => { if (!cancelled) onComplete(); };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { finish(); return; }
    const width = (root.clientWidth - 25) / 6;
    const x = (column: number) => column * (width + 5);
    const columns = plan.before.map((column, from) => column.map((card, index) => {
      const el = document.createElement("div");
      el.className = `absolute rounded-lg border border-background/60 font-display text-primary-foreground ${card.suit ? "bg-gold" : "bg-gold-soft"}`;
      Object.assign(el.style, { left: `${x(from)}px`, top: `${index * 44}px`, width: `${width}px`, height: "78px", zIndex: String(index + 1), boxShadow: "0 2px 3px color-mix(in srgb, var(--background) 35%, transparent)" });
      const number = document.createElement("span");
      number.className = "absolute inset-x-0 top-3 text-center text-[19px] leading-[1.2] font-medium tabular-nums max-[350px]:text-[18px]";
      number.textContent = String(card.value);
      const marker = document.createElement("span");
      marker.className = `absolute top-[5px] right-[5px] size-[5px] rounded-full ${card.suit ? "bg-current" : "border border-current"}`;
      el.append(number, marker); root.append(el);
      return { el, number, y: index * 44 };
    }));
    const run = (el: HTMLElement, frames: Parameters<typeof animate>[1], duration: number) => {
      const control = animate(el, frames, { duration, ease: [0.22, 1, 0.36, 1] });
      controls.add(control);
      return Promise.resolve(control).then(() => { controls.delete(control); });
    };
    const play = async () => {
      const { from, index, to } = plan.move;
      const group = columns[from].splice(index);
      const target = columns[to];
      group.forEach((card, i) => {
        card.el.style.zIndex = String(30 + i);
        if (plan.origin) {
          card.el.style.left = `${x(from) + plan.origin.dx}px`;
          card.el.style.top = `${card.y + plan.origin.dy}px`;
        }
      });
      await Promise.all(group.map((card, i) => {
        card.y = (target.length + i) * 44;
        return run(card.el, { left: x(to), top: card.y }, plan.origin ? .12 : .22);
      }));
      if (cancelled) return;
      target.push(...group);
      for (const merge of plan.merges) {
        const upper = target[merge.index], lower = target[merge.index + 1];
        // Raise the entire suffix, preserving the order approved in the demo.
        target.slice(merge.index + 1).forEach((card, i) => { card.el.style.zIndex = String(30 + i); });
        await Promise.all(target.slice(merge.index + 1).map((card) => {
          card.y -= 44;
          return run(card.el, { top: card.y }, .143);
        }));
        if (cancelled) return;
        upper.el.remove(); lower.number.textContent = String(merge.value);
        target.splice(merge.index, 1);
        const ghost = lower.el.cloneNode(false) as HTMLElement;
        ghost.style.zIndex = "0"; root.append(ghost);
        void run(ghost, { opacity: [.3, 0], scale: [1, 1.85], y: [0, 18] }, .39).then(() => ghost.remove());
        if (merge.multiplier > 1) {
          const combo = document.createElement("span");
          combo.className = "absolute inset-x-0 top-9 text-center text-[28px] font-medium";
          combo.textContent = `×${merge.multiplier}`; lower.el.append(combo);
          void run(combo, { opacity: [1, .9, 0], scale: [.75, 1.4, 1.8], y: [0, 0, 16] }, .39).then(() => combo.remove());
        }
        await run(lower.el, { scale: [1, 1.2, 1] }, .195);
        if (cancelled) return;
        target.forEach((card, i) => { card.el.style.zIndex = String(i + 1); });
      }
      // Let the final combo and trail fade before revealing the real board.
      await Promise.all([...controls].map((control) => Promise.resolve(control)));
      finish();
    };
    void play().catch(finish);
    const visibility = () => { if (document.hidden) finish(); };
    window.addEventListener("resize", finish);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelled = true;
      controls.forEach((control) => control.stop());
      root.replaceChildren();
      window.removeEventListener("resize", finish);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [plan, onComplete]);
  return <div ref={ref} aria-hidden data-testid="numsolis-animation" className="pointer-events-none absolute inset-0 z-20 overflow-visible" />;
}
