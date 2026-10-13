type Props = { className?: string; tone?: 'light' | 'dark'; size?: 'sm' | 'md' };

/**
 * Tanda ISYARA: empat batang yang terbaca sebagai jari tangan terbuka
 * sekaligus gelombang suara, plus satu titik (landmark / sinyal).
 */
export function LogoMark({ className = '' }: { className?: string; tone?: 'light' | 'dark' }) {
  // File logo transparan di /public/logo.png. Parameter `tone` dipertahankan di tanda
  // tangan agar pemanggil lama (tone="dark") tidak error, meski kini tidak memengaruhi gambar.
  return <img src="/logo.png" alt="" aria-hidden="true" className={`object-contain ${className}`} />;
}

export function Logo({ className = '', tone = 'light', size = 'md' }: Props) {
  const text = tone === 'light' ? 'text-brand-900' : 'text-white';
  // Logo sedikit lebih besar dari tinggi baris teks agar bobot visualnya seimbang
  // dengan tulisan ISYARA. File PNG punya ruang kosong atas-bawah, jadi object-contain
  // sudah memusatkan ikon di dalam kotak ini.
  const box = size === 'sm' ? 'size-7' : 'size-9';
  const type = size === 'sm' ? 'text-[10px]' : 'text-[15px]';
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {/* translate-y kecil: file PNG punya ruang kosong lebih banyak di bawah ikon,
          sehingga ikon duduk agak tinggi. Geser turun tipis agar center terhadap teks. */}
      <LogoMark className={`translate-y-[4px] ${box}`} tone={tone} />
      {/* Perataan vertikal teks ISYARA. Geser turun: translate-y-[Npx]. Naik: -translate-y-[Npx]. */}
      <span className={`translate-y-[4px] font-extrabold leading-none tracking-[0.14em] ${type} ${text}`}>ISYARA</span>
    </span>
  );
}
