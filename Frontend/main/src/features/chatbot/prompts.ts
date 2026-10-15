import { Calculator, CloudRain, Lightbulb, Sun } from 'lucide-react';

/** Pertanyaan cepat di layar awal Tanya ISYARA. */
export const QUICK_PROMPTS = [
    { text: 'Jelaskan siklus air', hint: 'IPA', icon: CloudRain },
    { text: 'Apa itu pecahan?', hint: 'Matematika', icon: Calculator },
    { text: 'Kenapa langit berwarna biru?', hint: 'Pengetahuan', icon: Sun },
    { text: 'Bantu aku latihan perkalian', hint: 'Latihan', icon: Lightbulb },
] as const;
