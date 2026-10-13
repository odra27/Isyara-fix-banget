import { useEffect } from 'react';
import { ScrollTrigger } from './lib/gsap';
import { Nav } from './components/landing/Nav';
import { Hero } from './components/landing/Hero';
import { RevealScene } from './components/landing/RevealScene';
import { Stat } from './components/landing/Stat';
import { TwoWay } from './components/landing/TwoWay';
import { HowItWorks } from './components/landing/HowItWorks';
import { Confidence } from './components/landing/Confidence';
import { Vocabulary } from './components/landing/Vocabulary';
import { Principles } from './components/landing/Principles';
import { Closing } from './components/landing/Closing';

export default function App() {
  useEffect(() => {
    // Font memengaruhi tinggi teks → hitung ulang posisi ScrollTrigger setelah font siap.
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
  }, []);

  return (
    <>
      <a
        href="#konten"
        className="sr-only z-[60] rounded-xl bg-brand-900 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Lewati ke konten
      </a>
      <Nav />
      <main id="konten">
        <Hero />
        <RevealScene />
        <Stat />
        <TwoWay />
        <HowItWorks />
        <Confidence />
        <Vocabulary />
        <Principles />
        <Closing />
      </main>
    </>
  );
}
