import { useRef } from 'react';
import { gsap, ScrollTrigger, useGSAP, MOTION_OK, REDUCED } from '../../lib/gsap';
import { CHAT, EASE, TABLET } from '../../animations/tokens';
import { HandSkeleton } from '../ui/HandSkeleton';
import { Icon, type IconName } from '../ui/Icon';
import { LogoMark } from '../ui/Logo';
const POINTS: { icon: IconName; title: string; desc: string }[] = [
  {
    icon: 'keyboard',
    title: 'Ketik atau berisyarat',
    desc: 'Pakai keyboard, atau isyaratkan ke kamera. Model kami mengenali 43 kata BISINDO terlatih dan mengubahnya jadi teks.',
  },
  {
    icon: 'hand',
    title: 'Jawaban jadi teks dan isyarat',
    desc: 'Jawaban AI tampil sebagai teks sekaligus animasi isyarat BISINDO. Kata di luar kosakata terlatih tetap dianimasikan.',
  },
  {
    icon: 'history',
    title: 'Riwayat tersimpan per siswa',
    desc: 'Setiap percakapan tersimpan di akun siswa, jadi bisa dibuka dan dilanjutkan lagi nanti.',
  },
];
const PROMPTS = ['Jelaskan siklus air', 'Apa itu persentase?', 'Rekomendasi materi kelas 5', 'Bantu aku latihan soal'];
const HISTORY = ['Siklus air', 'Apa itu persentase?', 'Latihan soal pecahan'];
export function Chatbot() {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from('.js-chat-point', {
          y: 22,
          autoAlpha: 0,
          stagger: 0.1,
          duration: 0.55,
          ease: EASE.enter,
          scrollTrigger: { trigger: '.js-chat-points', start: 'top 80%', once: true },
        });
        // Percakapan muncul berurutan: pertanyaan → mengetik… → jawaban → saran.
        const tl = gsap.timeline({ scrollTrigger: { trigger: '.js-chat-window', start: 'top 72%', once: true } });
        tl.from('.js-chat-window', { y: 36, autoAlpha: 0, duration: 0.7, ease: EASE.enter })
          .from('.js-bubble-user', { y: 16, scale: 0.96, autoAlpha: 0, duration: 0.45, ease: EASE.enter, transformOrigin: '100% 100%' })
          .from('.js-typing', { autoAlpha: 0, duration: 0.2 }, `+=${CHAT.gap}`)
          .fromTo(
            '.js-typing i',
            { y: 0 },
            { y: -3, duration: 0.25, yoyo: true, repeat: 3, stagger: 0.1, ease: EASE.loop },
            '<',
          )
          .to('.js-typing', { autoAlpha: 0, duration: 0.2 }, `+=${CHAT.typing - 0.8}`)
          .set('.js-typing', { display: 'none' })
          .from('.js-bubble-bot', { y: 16, scale: 0.96, autoAlpha: 0, duration: 0.5, ease: EASE.enter, transformOrigin: '0% 100%' })
          .from('.js-prompt', { y: 8, autoAlpha: 0, stagger: 0.06, duration: 0.35, ease: EASE.enter }, `+=${CHAT.gap}`);
        // Avatar jawaban berisyarat terus selama terlihat.
        const sign = gsap
          .timeline({ repeat: -1, yoyo: true, paused: true, defaults: { duration: TABLET.signHalf, ease: EASE.loop } })
          .to(q('.js-bot-hand-l'), { x: 4, y: -6, rotation: -12 }, 0)
          .to(q('.js-bot-hand-r'), { x: -4, y: 5, rotation: 10 }, 0);
        ScrollTrigger.create({
          trigger: '.js-chat-window',
          start: 'top bottom',
          end: 'bottom top',
          onToggle: (self) => (self.isActive ? sign.play() : sign.pause()),
        });
      });
      mm.add(REDUCED, () => {
        gsap.set('.js-typing', { display: 'none' });
      });
    },
    { scope: root },
  );
  return (
    <section id="chatbot" ref={root} className="relative overflow-hidden py-20 md:py-32">
      <div aria-hidden="true" className="pointer-events-none absolute -right-40 top-20 size-[480px] rounded-full bg-brand-100/45 blur-3xl" />
      <div className="wrap relative grid gap-12 md:grid-cols-[0.9fr_1.1fr] md:items-center md:gap-14">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-[12px] font-bold text-brand-600">
            <Icon name="sparkles" className="size-3.5" />
            Chatbot AI
          </p>
          <h2 className="mt-4 text-[clamp(36px,7vw,64px)] font-extrabold leading-[0.96] tracking-[-0.06em]">
            Tanya ISYARA.
            <br />
            <span className="text-brand-600">Ketik atau isyaratkan.</span>
          </h2>
          <p className="mt-5 max-w-[440px] text-[15px] leading-relaxed text-brand-800">
            Bingung soal pelajaran? Tanyakan saja. Pertanyaan dikirim ke model AI, lalu jawabannya ditampilkan dengan
            cara yang mudah dipahami.
          </p>
          <ul className="js-chat-points mt-8 grid gap-5">
            {POINTS.map((p) => (
              <li key={p.title} className="js-chat-point flex gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                  <Icon name={p.icon} className="size-5" />
                </span>
                <div>
                  <h3 className="text-[16px] font-extrabold tracking-[-0.02em]">{p.title}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">{p.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        {/* Mock jendela chat */}
        <div
          role="img"
          aria-label="Contoh percakapan Tanya ISYARA: siswa bertanya 'Jelaskan siklus air' lewat isyarat, lalu ISYARA menjawab dengan teks dan animasi isyarat. Tersedia saran pertanyaan seperti 'Apa itu persentase?' dan 'Bantu aku latihan soal'."
          className="js-chat-window"
        >
          <div aria-hidden="true" className="grid overflow-hidden rounded-[30px] border border-line bg-white shadow-phone sm:grid-cols-[150px_1fr]">
            {/* Riwayat */}
            <aside className="hidden border-r border-line bg-tint p-4 sm:block">
              <span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-muted">
                <Icon name="history" className="size-3.5" /> Riwayat
              </span>
              <ul className="mt-3 grid gap-1.5">
                {HISTORY.map((h, i) => (
                  <li
                    key={h}
                    className={`truncate rounded-xl px-2.5 py-2 text-[11.5px] font-semibold ${
                      i === 0 ? 'bg-white text-brand-900 shadow-[0_2px_8px_rgba(38,33,92,0.06)]' : 'text-brand-800'
                    }`}
                  >
                    {h}
                  </li>
                ))}
              </ul>
              <span className="mt-4 flex items-center gap-1.5 text-[10.5px] text-muted">
                <Icon name="lock" className="size-3" /> Tersimpan di akunmu
              </span>
            </aside>
            <div className="flex min-h-[460px] flex-col p-4 md:p-5">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="flex items-center gap-2 text-[13px] font-extrabold">
                  <LogoMark className="size-6" />
                  Tanya ISYARA
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-tint px-2.5 py-1 text-[10px] font-bold text-brand-800">
                  <span className="size-1.5 rounded-full bg-ok" /> Siap
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-3 py-4">
                {/* Pertanyaan siswa */}
                <div className="js-bubble-user flex max-w-[85%] flex-col items-end self-end">
                  <span className="mb-1 flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-600">
                    <Icon name="hand" className="size-3" /> via isyarat
                  </span>
                  <span className="rounded-2xl rounded-tr-md bg-brand-600 px-4 py-2.5 text-[14px] font-bold text-white">
                    Jelaskan siklus air
                  </span>
                </div>
                <div className="js-typing flex w-fit items-center gap-1 rounded-2xl rounded-tl-md bg-tint px-4 py-3">
                  {[0, 1, 2].map((i) => (
                    <i key={i} className="block size-1.5 rounded-full bg-brand-400" />
                  ))}
                </div>
                {/* Jawaban ISYARA */}
                <div className="js-bubble-bot flex max-w-[92%] gap-3 rounded-2xl rounded-tl-md bg-tint p-3">
                  <span className="relative h-[92px] w-[78px] shrink-0 overflow-hidden rounded-xl bg-gradient-to-b from-brand-100 to-brand-50">
                    <svg viewBox="0 0 78 92" className="absolute inset-0 size-full">
                      <circle cx="39" cy="30" r="13" className="fill-brand-200" />
                      <path d="M12 92c0-26 12-40 27-40s27 14 27 40Z" className="fill-brand-600" />
                    </svg>
                    <span className="js-bot-hand-l absolute bottom-1 left-1 w-[38%] text-brand-900">
                      <HandSkeleton className="w-full" dotClassName="fill-brand-50" />
                    </span>
                    <span className="js-bot-hand-r absolute bottom-2 right-1 w-[34%] text-brand-900">
                      <HandSkeleton className="w-full" mirrored dotClassName="fill-brand-50" />
                    </span>
                    <span className="absolute inset-x-1 top-1 rounded-md bg-white/85 py-0.5 text-center text-[7.5px] font-extrabold tracking-[0.06em] text-brand-800">
                      BISINDO
                    </span>
                  </span>
                  <span className="text-[13px] leading-relaxed text-brand-900">
                    <span className="font-bold">Siklus air</span> adalah perjalanan air yang terus berulang: air menguap,
                    menjadi awan, turun sebagai hujan, lalu meresap ke tanah.
                    <span className="mt-2 flex items-center gap-1 text-[10.5px] font-bold text-brand-600">
                      <Icon name="volume" className="size-3" /> Dengarkan · Ulangi isyarat
                    </span>
                  </span>
                </div>
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {PROMPTS.map((p) => (
                  <li key={p} className="js-prompt rounded-full border border-brand-100 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-brand-800">
                    {p}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center gap-2 rounded-2xl border border-line bg-white p-1.5 pl-4">
                <span className="flex-1 text-[12.5px] text-muted">Ketik pertanyaan…</span>
                <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon name="camera" className="size-4" />
                </span>
                <span className="grid size-9 place-items-center rounded-xl bg-brand-600 text-white">
                  <Icon name="send" className="size-4" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
