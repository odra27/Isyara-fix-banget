import { cn } from '@/lib/utils';

/** Tanda ISYARA. File logo transparan di /public/logo.png (object-contain agar proporsi terjaga). */
export function LogoMark({ className }: { className?: string }) {
  return <img src="/logo.png" alt="" aria-hidden="true" className={cn('object-contain', className)} />;
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className="size-8" />
      <span className="text-[0.9375rem] font-extrabold tracking-[0.14em] text-brand-900">ISYARA</span>
    </span>
  );
}
