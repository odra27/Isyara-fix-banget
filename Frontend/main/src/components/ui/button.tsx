import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'dark' | 'outline' | 'ghost' | 'soft';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-800 shadow-[0_10px_22px_rgba(83,74,183,0.22)]',
  dark: 'bg-brand-900 text-white hover:bg-brand-800',
  outline: 'border border-line bg-white text-brand-800 hover:bg-brand-50',
  ghost: 'text-brand-800 hover:bg-brand-50',
  soft: 'bg-brand-50 text-brand-800 hover:bg-brand-100',
};
const SIZE: Record<Size, string> = {
  sm: 'h-9 px-3 text-xs gap-1.5 rounded-xl',
  md: 'h-11 px-4 text-sm gap-2 rounded-2xl',
  lg: 'h-14 px-6 text-base gap-2.5 rounded-2xl',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = 'primary', size = 'md', type = 'button', ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn(
      'inline-flex shrink-0 items-center justify-center font-bold transition-colors disabled:opacity-50 disabled:shadow-none [&_svg]:size-[1.1em] [&_svg]:shrink-0',
      VARIANT[variant],
      SIZE[size],
      className,
    )}
    {...props}
  />
));
Button.displayName = 'Button';
