import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & {
  label: string;
  /** Ikon penanda di sisi kiri dalam field. */
  icon: ReactNode;
  /** Field password mendapat tombol perlihatkan/sembunyikan karakter. */
  password?: boolean;
  /** Pesan kesalahan khusus field ini. */
  error?: string | null;
};

/**
 * Field form dengan label terkait, ikon penanda di kiri, dan (untuk password)
 * tombol perlihatkan/sembunyikan karakter (Requirement 3).
 *
 * Label selalu berupa elemen <label> yang terhubung ke input lewat id, jadi
 * pembaca layar membacakannya saat field menerima fokus.
 */
export function Field({ label, icon, password = false, error, className, ...rest }: Props) {
  const id = useId();
  const errorId = `${id}-error`;
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-brand-900">
        {label}
      </label>

      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 grid -translate-y-1/2 place-items-center text-brand-400" aria-hidden="true">
          {icon}
        </span>

        <input
          id={id}
          type={password && !visible ? 'password' : 'text'}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            'h-13 w-full rounded-2xl border bg-tint pl-11 text-base text-brand-900 placeholder:text-muted',
            'focus:border-brand-400 focus:bg-white focus:outline-none',
            password ? 'pr-12' : 'pr-4',
            error ? 'border-rec' : 'border-line',
            className,
          )}
          {...rest}
        />

        {password && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Sembunyikan password' : 'Perlihatkan password'}
            aria-pressed={visible}
            className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-xl text-muted transition-colors hover:bg-brand-50 hover:text-brand-800"
          >
            {visible ? <EyeOff className="size-[1.1rem]" aria-hidden="true" /> : <Eye className="size-[1.1rem]" aria-hidden="true" />}
          </button>
        )}
      </div>

      {error && (
        <p id={errorId} className="text-xs font-semibold text-rec">
          {error}
        </p>
      )}
    </div>
  );
}
