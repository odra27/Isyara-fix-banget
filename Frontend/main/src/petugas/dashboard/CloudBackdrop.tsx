/**
 * Background foto awan ungu untuk bagian ATAS kartu identitas (di belakang avatar/nama/badge),
 * memenuhi area hingga mendekati garis pembatas kartu. Murni dekoratif (aria-hidden).
 *
 * Foto diambil dari /public/petugas/card-clouds.jpg. Bila file tidak ada, elemen img
 * gagal dimuat dan hanya menyisakan gradasi lembut sebagai cadangan — kartu tetap tampil normal.
 *
 * Keterbacaan: di atas foto ada lapisan putih yang menebal ke bawah, sehingga area nama/
 * jabatan/badge punya latar lebih terang dan teks tetap jelas. Teks konten juga dibuat kontras
 * tinggi di DashboardPage.
 */
export function CloudBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-44 overflow-hidden rounded-t-[1.75rem]"
      style={{ maskImage: 'linear-gradient(to bottom, #000 90%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, #000 90%, transparent)' }}
    >
      {/* Cadangan gradasi lembut bila foto belum tersedia */}
      <div className="absolute inset-0 bg-gradient-to-b from-brand-100/70 via-brand-50/70 to-white" />

      {/* Foto awan ungu: penuhi area atas sampai mendekati pembatas. */}
      <img
        src="/petugas/card-clouds.jpg"
        alt=""
        loading="lazy"
        className="absolute inset-0 size-full object-cover object-center opacity-55"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />

      {/* Lapisan putih yang menebal ke bawah → menjaga kontras teks di area nama/jabatan. */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-white/35 to-white/85" />
    </div>
  );
}
