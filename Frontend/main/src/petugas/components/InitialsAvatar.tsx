/**
 * Kompatibilitas: InitialsAvatar kini merupakan Avatar (yang mendukung foto + fallback
 * inisial). Dipertahankan agar impor lama tidak patah. Komponen baru sebaiknya memakai
 * Avatar langsung.
 */
export { Avatar as InitialsAvatar } from './Avatar';
