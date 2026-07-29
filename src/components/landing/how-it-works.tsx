"use client";

import { motion } from "framer-motion";
import { Zap, CloudUpload, Smartphone } from "lucide-react";
import type { Dictionary } from "@/i18n/get-dictionary";

const icons = [Zap, CloudUpload, Smartphone];

export function HowItWorks({ dict }: { dict: Dictionary }) {
  return (
    <section id="how" className="border-t border-surface/60 py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="label-mono text-gold">{dict.how.eyebrow}</p>
        <h2 className="mt-3 font-display text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
          {dict.how.title}
        </h2>

        <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-surface bg-surface sm:grid-cols-3">
          {dict.how.steps.map((step, i) => {
            const Icon = icons[i];
            return (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.55, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                className="bg-card p-6 md:p-8"
              >
                <div className="flex items-center justify-between">
                  <Icon className="size-5 text-gold" />
                  <span className="label-mono text-muted-foreground">0{i + 1}</span>
                </div>
                <h3 className="mt-5 font-display text-lg font-medium text-foreground">{step.title}</h3>
                <p className="font-body mt-2 text-sm leading-[1.6] text-muted-foreground">{step.text}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
