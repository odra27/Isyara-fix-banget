import { HandSkeleton } from '@/components/ui/hand-skeleton';

/**
 * Ilustrasi perangkat kiosk untuk area branding halaman login.
 * Digambar dengan elemen biasa (tanpa aset gambar) agar ringan dan ikut palet brand.
 * Murni dekoratif → disembunyikan dari pembaca layar.
 */
export function KioskPreview() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[22rem] select-none lg:mx-0">
      {/* Bodi perangkat */}
      <div className="rounded-[1.75rem] bg-white p-3 shadow-soft ring-1 ring-line">
        {/* Layar */}
        <div className="relative aspect-[4/3] overflow-hidden rounded-[1.25rem] bg-brand-950">
          <div className="absolute inset-0 grid place-items-center">
            <HandSkeleton className="size-28 text-brand-200/90" />
          </div>
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-1 text-[0.625rem] font-bold text-white">
            <span className="size-1.5 rounded-full bg-rec anim-rec" />
            Merekam
          </span>
          <p className="absolute inset-x-3 bottom-3 rounded-xl bg-white/10 px-3 py-2 text-center text-[0.6875rem] font-semibold text-white backdrop-blur-sm">
            Silakan mulai mengisyaratkan
          </p>
        </div>
        {/* Speaker bar */}
        <div className="mx-auto mt-3 h-1.5 w-16 rounded-full bg-brand-100" />
      </div>
      {/* Kaki dudukan */}
      <div className="mx-auto h-3 w-28 rounded-b-2xl bg-brand-100" />
    </div>
  );
}
