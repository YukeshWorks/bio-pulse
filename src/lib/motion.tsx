import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Motion helpers. All of them:
 *  - animate only opacity/transform (GPU-friendly, no layout shift),
 *  - render content immediately when the user prefers reduced motion, when IntersectionObserver is
 *    unavailable (old browsers, tests) or before JS runs,
 *  - never hide information: animations only change how content arrives.
 */

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

/** Returns a ref and whether the element has scrolled into view (once). */
export function useInView<T extends Element>(rootMargin = '0px 0px -8% 0px'): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined' || prefersReducedMotion());
  useEffect(() => {
    if (visible || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, rootMargin]);
  return [ref, visible];
}

/** Class names for scroll-reveal; `delay` staggers siblings (ms, capped). */
export function useReveal<T extends Element>(delay = 0): { ref: React.RefObject<T | null>; className: string; style: React.CSSProperties } {
  const [ref, visible] = useInView<T>();
  return { ref, className: `reveal ${visible ? '' : 'reveal-hidden'}`, style: { transitionDelay: visible ? `${Math.min(delay, 400)}ms` : '0ms' } };
}

export function Reveal({ children, delay = 0, className = '', as: Tag = 'div' }: { children: ReactNode; delay?: number; className?: string; as?: 'div' | 'li' | 'section' }) {
  const r = useReveal<HTMLElement>(delay);
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag ref={r.ref as any} className={`${r.className} ${className}`} style={r.style}>
      {children}
    </Tag>
  );
}

/** Counts from 0 to `value` once visible (ease-out, 900 ms). Shows the final value without motion. */
export function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [ref, visible] = useInView<HTMLSpanElement>();
  const [shown, setShown] = useState(() => (prefersReducedMotion() || typeof IntersectionObserver === 'undefined' ? value : 0));
  useEffect(() => {
    if (!visible || prefersReducedMotion() || typeof requestAnimationFrame === 'undefined') {
      setShown(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, value, duration]);
  return (
    <span ref={ref} className="tabular-nums">
      {shown}
    </span>
  );
}

/** Sentence that settles in word by word (total stagger capped at ~0.9 s). Text stays one string for screen readers. */
export function WordReveal({ text }: { text: string }) {
  const words = text.split(/(\s+)/);
  const step = Math.min(35, 900 / Math.max(1, words.length / 2));
  let i = 0;
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((w, k) =>
          /^\s+$/.test(w) ? (
            w
          ) : (
            <span key={k} className="inline-block animate-word" style={{ animationDelay: `${120 + i++ * step}ms` }}>
              {w}
            </span>
          ),
        )}
      </span>
    </>
  );
}

const ECG = 'M0 30 H90 L100 30 L108 12 L118 48 L126 22 L132 30 H210 L218 30 L224 20 L232 40 L238 30 H330 L340 30 L348 8 L358 52 L366 18 L372 30 H480';

/** Brand heartbeat line for the hero: draws once, then a faint highlight travels along it. */
export function PulseLine({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 60" className={className} aria-hidden="true">
      <path d={ECG} pathLength={1} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className="draw-path opacity-40" vectorEffect="non-scaling-stroke" />
      <path
        d={ECG}
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="motion-loop animate-travel"
        style={{ strokeDasharray: '0.08 1.02', animationDelay: '1.6s' }}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Floating "Back to top" button, shown after scrolling down a long page. */
export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 900);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })}
      className={`fixed bottom-5 right-5 z-40 rounded-full border border-ink-500 bg-ink-800/90 p-3 text-fg shadow-lg backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/60 ${show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'}`}
      tabIndex={show ? 0 : -1}
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M10 15V5M5 10l5-5 5 5" />
      </svg>
    </button>
  );
}
