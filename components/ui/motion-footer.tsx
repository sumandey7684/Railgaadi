'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowUp, Github, Train } from 'lucide-react';
import { cn } from '@/lib/utils';

gsap.registerPlugin(ScrollTrigger);

const MARQUEE_ITEMS = [
  'LIVE TRAIN TRACKING',
  'REAL-TIME JOURNEY INTELLIGENCE',
  'INTERACTIVE ROUTE MAPS',
  'JOURNEY ANALYTICS',
  'WEATHER & TERRAIN',
  'LOCATION-AWARE TRAVEL',
] as const;

const PRODUCT_LINKS = [
  { label: 'Track Train', href: '/' },
  { label: 'Search Trains', href: '/?search=1' },
  { label: 'Live Journey', href: '/' },
  { label: 'Favorites', href: '/favorites' },
] as const;

/** Feature labels only — these live inside live train views, not dedicated routes. */
const JOURNEY_FEATURES = [
  'Live Tracking',
  'Station Timeline',
  'Interactive Route Map',
  'Delay & Elevation Analytics',
] as const;

const PROJECT_LINKS = [
  {
    label: 'GitHub',
    href: 'https://github.com/sumandey7684/Railgaadi',
    external: true,
  },
] as const;

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isCoarsePointer() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(pointer: coarse)').matches;
}

function MagneticPill({
  children,
  className,
  href,
  external,
  variant = 'secondary',
}: {
  children: React.ReactNode;
  className?: string;
  href: string;
  external?: boolean;
  variant?: 'primary' | 'secondary' | 'tertiary';
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const xTo = useRef<ReturnType<typeof gsap.quickTo> | null>(null);
  const yTo = useRef<ReturnType<typeof gsap.quickTo> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || isCoarsePointer()) return;

    xTo.current = gsap.quickTo(el, 'x', { duration: 0.35, ease: 'power3.out' });
    yTo.current = gsap.quickTo(el, 'y', { duration: 0.35, ease: 'power3.out' });

    return () => {
      xTo.current = null;
      yTo.current = null;
      gsap.set(el, { x: 0, y: 0 });
    };
  }, []);

  const onMove = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!xTo.current || !yTo.current || prefersReducedMotion() || isCoarsePointer()) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const relX = event.clientX - rect.left - rect.width / 2;
    const relY = event.clientY - rect.top - rect.height / 2;
    xTo.current(relX * 0.28);
    yTo.current(relY * 0.28);
  };

  const onLeave = () => {
    xTo.current?.(0);
    yTo.current?.(0);
  };

  const classes = cn(
    'inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
    variant === 'primary' &&
      'bg-primary text-primary-foreground shadow-glow hover:bg-sky-600',
    variant === 'secondary' &&
      'border border-border/60 bg-muted/40 text-foreground/80 hover:border-primary/40 hover:bg-muted/60 hover:text-primary',
    variant === 'tertiary' &&
      'border border-transparent text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground',
    className
  );

  if (external) {
    return (
      <a
        ref={ref}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        {children}
      </a>
    );
  }

  return (
    <Link ref={ref} href={href} className={classes} onMouseMove={onMove} onMouseLeave={onLeave}>
      {children}
    </Link>
  );
}

function FooterLink({
  href,
  children,
  external,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  const className = cn(
    'text-sm text-muted-foreground transition-colors',
    'hover:text-foreground',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:rounded-sm'
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export function CinematicFooter({ className }: { className?: string }) {
  const rootRef = useRef<HTMLElement>(null);
  const bgWordRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced = prefersReducedMotion();
    const ctx = gsap.context(() => {
      if (contentRef.current && !reduced) {
        gsap.fromTo(
          contentRef.current.querySelectorAll('[data-footer-reveal]'),
          { y: 28, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.7,
            stagger: 0.08,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: root,
              start: 'top 85%',
              once: true,
            },
          }
        );
      }

      if (bgWordRef.current && !reduced) {
        gsap.to(bgWordRef.current, {
          yPercent: -12,
          ease: 'none',
          scrollTrigger: {
            trigger: root,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        });
      }

      if (marqueeRef.current && !reduced) {
        const track = marqueeRef.current.querySelector('[data-marquee-track]');
        if (track) {
          gsap.to(track, {
            xPercent: -50,
            duration: 28,
            ease: 'none',
            repeat: -1,
          });
        }
      }
    }, root);

    return () => {
      ctx.revert();
    };
  }, []);

  const scrollToTop = () => {
    if (prefersReducedMotion()) {
      window.scrollTo(0, 0);
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const marqueeLoop = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];

  return (
    <footer
      ref={rootRef}
      className={cn(
        'relative mt-8 w-full overflow-x-hidden border-t border-border bg-background',
        'pb-28 pt-11 md:pb-10 md:pt-16',
        className
      )}
      aria-labelledby="railgaadi-footer-heading"
    >
      {/* Soft railway aurora — theme tokens only */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -left-1/4 top-0 h-64 w-1/2 rounded-full bg-primary/10 blur-3xl dark:bg-primary/15" />
        <div className="absolute -right-1/4 bottom-0 h-72 w-1/2 rounded-full bg-emerald-500/10 blur-3xl dark:bg-emerald-400/10" />
        <div
          className="absolute inset-0 opacity-[0.035] dark:opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      {/* Oversized brand watermark */}
      <div
        ref={bgWordRef}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-6 select-none overflow-hidden text-center md:top-2"
      >
        <span className="inline-block whitespace-nowrap text-[clamp(4.5rem,18vw,12rem)] font-extrabold leading-none tracking-tighter text-foreground/[0.04] dark:text-foreground/[0.06]">
          RAILGAADI
        </span>
      </div>

      <div ref={contentRef} className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6">
        {/* Hero identity */}
        <div data-footer-reveal className="mx-auto max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <Train className="h-3.5 w-3.5" aria-hidden />
            RailGaadi
          </div>
          <h2
            id="railgaadi-footer-heading"
            className="text-balance text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            Your journey doesn&apos;t end at the destination.
          </h2>
          <p className="mt-3 text-base font-medium text-muted-foreground sm:text-lg">
            See the route. Understand the journey.
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Real-time railway journey intelligence with live train tracking, route analytics,
            weather, elevation, and location-aware travel context.
          </p>
        </div>

        {/* Marquee */}
        <div
          data-footer-reveal
          className="relative mt-14 overflow-hidden rounded-2xl border border-border/70 bg-muted/40 py-3 dark:bg-muted/20"
          aria-hidden={false}
          role="presentation"
        >
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-background to-transparent" />
          <div ref={marqueeRef} className="overflow-hidden">
            <div
              data-marquee-track
              className="flex w-max items-center gap-8 whitespace-nowrap px-4 will-change-transform"
            >
              {marqueeLoop.map((item, index) => (
                <span
                  key={`${item}-${index}`}
                  className="inline-flex items-center gap-8 text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground"
                >
                  {item}
                  <span className="inline-block h-1 w-1 rounded-full bg-primary/70" aria-hidden />
                </span>
              ))}
            </div>
          </div>
          <span className="sr-only">
            Live train tracking, real-time journey intelligence, interactive route maps, journey
            analytics, weather and terrain, location-aware travel
          </span>
        </div>

        {/* Link columns + CTAs */}
        <div
          data-footer-reveal
          className="mt-14 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-12 lg:gap-8"
        >
          <div className="lg:col-span-4">
            <p className="text-lg font-extrabold tracking-tight text-foreground">
              Rail<span className="text-primary">Gaadi</span>
            </p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Real-time railway journey intelligence with live train tracking, route analytics,
              weather, elevation, and location-aware travel context.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <MagneticPill href="/" variant="primary">
                Track a Train
              </MagneticPill>
              <MagneticPill href="/?search=1" variant="secondary">
                Search
              </MagneticPill>
              <MagneticPill
                href="https://github.com/sumandey7684/Railgaadi"
                external
                variant="tertiary"
              >
                <Github className="h-3.5 w-3.5" aria-hidden />
                GitHub
              </MagneticPill>
            </div>
          </div>

          <nav className="lg:col-span-2" aria-label="Product">
            <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-foreground">
              Product
            </h3>
            <ul className="flex flex-col gap-2.5">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.label}>
                  <FooterLink href={link.href}>{link.label}</FooterLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="lg:col-span-3">
            <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-foreground">
              Journey
            </h3>
            <ul className="flex flex-col gap-2.5">
              {JOURNEY_FEATURES.map((label) => (
                <li key={label} className="text-sm text-muted-foreground">
                  {label}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/80">
              Available on live train pages after you start tracking.
            </p>
          </div>

          <nav className="lg:col-span-3" aria-label="Project">
            <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-foreground">
              Project
            </h3>
            <ul className="flex flex-col gap-2.5">
              {PROJECT_LINKS.map((link) => (
                <li key={link.label}>
                  <FooterLink href={link.href} external={link.external}>
                    {link.label}
                  </FooterLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Bottom bar */}
        <div
          data-footer-reveal
          className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-border pt-6 sm:flex-row sm:items-center"
        >
          <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-3">
            <span>© 2026 RailGaadi</span>
            <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" aria-hidden />
            <span>Built for better journeys.</span>
          </div>

          <button
            type="button"
            onClick={scrollToTop}
            aria-label="Back to top"
            className={cn(
              'inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3.5 py-2',
              'text-xs font-semibold text-foreground/80 transition-colors',
              'hover:border-primary/40 hover:text-primary',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60'
            )}
          >
            <ArrowUp className="h-3.5 w-3.5" aria-hidden />
            Back to Top
          </button>
        </div>
      </div>
    </footer>
  );
}

export { CinematicFooter as MotionFooter };
