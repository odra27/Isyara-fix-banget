import { forwardRef, useEffect, useRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ElementType, type ReactNode } from 'react';
import { gsap, MOTION_OK, useGSAP } from '../../lib/gsap';
import { isValidAppUrl, LOGIN_URL } from '../../config/links';
import { Logo } from './Logo';

/**
 * Footer "tirai" (adaptasi motion-footer). Footer diam di belakang halaman dan tersingkap saat
 * halaman habis di-scroll: pembungkus memakai clip-path, footer di dalamnya position: fixed.
 * Teks raksasa ISYARA naik pelan (parallax), judul + tombol muncul bertahap, tombol "magnetik"
 * mengikuti kursor. Tema terang dengan aksen ungu tipis. prefers-reduced-motion: semua diam.
 */

const MARQUEE = [
  'Belajar dengan bahasa isyarat',
  'Caption di setiap video',
  'Tanya di menit yang bikin bingung',
  'Materi PDF jadi ramah Tuli',
  'Privasi siswa terjaga',
];

type MagneticProps = ButtonHTMLAttributes<HTMLButtonElement> & AnchorHTMLAttributes<HTMLAnchorElement> & { as?: ElementType; children: ReactNode };

/** Tombol yang sedikit tertarik ke arah kursor (hanya pointer presisi + motion diizinkan). */
const Magnetic = forwardRef<HTMLElement, MagneticProps>(function Magnetic({ as: Tag = 'button', className = '', children, ...props }, forwarded) {
  const local = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = local.current;
    if (!el || !window.matchMedia(`${MOTION_OK} and (pointer: fine)`).matches) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      gsap.to(el, { x: x * 0.3, y: y * 0.3, scale: 1.04, duration: 0.4, ease: 'power2.out' });
    };
    const leave = () => gsap.to(el, { x: 0, y: 0, scale: 1, duration: 1, ease: 'elastic.out(1, 0.35)' });
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      gsap.killTweensOf(el);
    };
  }, []);
  return (
    <Tag
      ref={(node: HTMLElement | null) => {
        local.current = node;
        if (typeof forwarded === 'function') forwarded(node);
        else if (forwarded) forwarded.current = node;
      }}
      className={`will-change-transform ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
});

const PILL =
  'inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white/80 shadow-[0_10px_30px_-12px_rgba(38,33,92,0.25)] backdrop-blur transition-colors hover:border-brand-200 hover:bg-white';

export function MotionFooter() {
  const wrap = useRef<HTMLDivElement>(null);
  const loginHref = isValidAppUrl(LOGIN_URL) ? LOGIN_URL : '#';

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo(
          '.js-mf-giant',
          { yPercent: 18, scale: 0.86, autoAlpha: 0 },
          { yPercent: 0, scale: 1, autoAlpha: 1, ease: 'power1.out', scrollTrigger: { trigger: wrap.current, start: 'top 85%', end: 'bottom bottom', scrub: 1 } },
        );
        gsap.fromTo(
          '.js-mf-reveal',
          { y: 40, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, stagger: 0.12, ease: 'power3.out', scrollTrigger: { trigger: wrap.current, start: 'top 55%', end: 'bottom bottom', scrub: 1 } },
        );
      });
    },
    { scope: wrap },
  );

  return (
    <div ref={wrap} className="relative h-[100svh] min-h-[620px] w-full" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }}>
      <footer className="fixed bottom-0 left-0 flex h-[100svh] min-h-[620px] w-full flex-col justify-between overflow-hidden bg-tint text-brand-900">
        {/* cahaya + grid halus */}
        <div aria-hidden="true" className="mf-aurora pointer-events-none absolute left-1/2 top-1/2 h-[60vh] w-[80vw] -translate-x-1/2 -translate-y-1/2 rounded-[50%] blur-[80px]" />
        <div aria-hidden="true" className="mf-grid pointer-events-none absolute inset-0" />

        {/* teks raksasa */}
        <div aria-hidden="true" className="js-mf-giant mf-giant pointer-events-none absolute -bottom-[3vh] left-1/2 -translate-x-1/2 select-none whitespace-nowrap">
          ISYARA
        </div>

        {/* marquee miring */}
        <div className="absolute left-0 top-10 z-10 w-full -rotate-2 scale-110 overflow-hidden border-y border-line bg-white/70 py-3.5 backdrop-blur-md">
          <div className="mf-marquee flex w-max text-[11px] font-extrabold uppercase tracking-[0.28em] text-muted md:text-xs">
            {[0, 1].map((k) => (
              <div key={k} className="flex items-center gap-10 px-5" aria-hidden={k === 1}>
                {MARQUEE.map((t, i) => (
                  <span key={t} className="flex items-center gap-10">
                    <span>{t}</span>
                    <span className={i % 2 ? 'text-brand-200' : 'text-brand-400'}>✦</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* isi tengah */}
        <div className="relative z-10 mx-auto mt-24 flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 text-center">
          <h2 className="js-mf-reveal text-[clamp(40px,8.5vw,92px)] font-extrabold leading-[0.95] tracking-[-0.065em] text-brand-950">
            Belajar tanpa batas,
            <br />
            <span className="text-brand-600">untuk semua.</span>
          </h2>
          <p className="js-mf-reveal mt-5 max-w-md text-[15px] leading-relaxed text-muted">
            Tanya dengan ketikan atau isyarat, tonton video bercaption, dan ubah materi PDF jadi penjelasan yang mudah dipahami.
          </p>
          <div className="js-mf-reveal mt-9 flex w-full flex-col items-center gap-4">
            <div className="flex flex-wrap justify-center gap-3">
              <Magnetic as="a" href={loginHref} className="inline-flex items-center gap-2 rounded-full bg-brand-900 px-8 py-4 text-[15px] font-bold text-white shadow-[0_18px_40px_-14px_rgba(38,33,92,0.55)] hover:bg-brand-800">
                Masuk sebagai siswa <span aria-hidden="true">→</span>
              </Magnetic>
              <Magnetic as="a" href="#sekolah" className={`${PILL} px-8 py-4 text-[15px] font-bold text-brand-900`}>
                Untuk sekolah
              </Magnetic>
            </div>
            <div className="flex flex-wrap justify-center gap-2.5">
              {[
                ['Fitur', '#fitur'],
                ['Cara kerja', '#cara-kerja'],
                ['Untuk sekolah', '#sekolah'],
              ].map(([label, href]) => (
                <Magnetic key={href} as="a" href={href} className={`${PILL} px-5 py-2.5 text-[13px] font-semibold text-muted hover:text-brand-900`}>
                  {label}
                </Magnetic>
              ))}
            </div>
          </div>
        </div>

        {/* bar bawah */}
        <div className="relative z-20 flex w-full flex-col items-center justify-between gap-5 px-6 pb-7 md:flex-row md:px-12">
          <div className="order-2 flex items-center gap-3 md:order-1">
            <Logo size="sm" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">© 2026 · Hackathon JOINTS</span>
          </div>
          <p className={`${PILL} order-1 cursor-default px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted md:order-2`}>
            Dibuat dengan <span className="mf-heart text-rec" aria-label="cinta">❤</span> untuk siswa Tuli Indonesia
          </p>
          <Magnetic
            as="button"
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia(MOTION_OK).matches ? 'smooth' : 'auto' })}
            aria-label="Kembali ke atas"
            className={`${PILL} group order-3 size-12 justify-center text-muted hover:text-brand-900`}
          >
            <svg className="size-5 transition-transform duration-300 group-hover:-translate-y-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </Magnetic>
        </div>
      </footer>
    </div>
  );
}
