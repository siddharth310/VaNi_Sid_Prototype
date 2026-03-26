import { useEffect, useState } from 'react';

/**
 * Normalised 0–1 RMS amplitude from an AnalyserNode (~60fps).
 */
export function useAudioVisualiser(
  analyser: AnalyserNode | null
): number {
  const [amplitude, setAmplitude] = useState(0);

  useEffect(() => {
    if (!analyser) {
      setAmplitude(0);
      return;
    }
    let raf = 0;
    const data = new Uint8Array(analyser.frequencyBinCount);

    const loop = (): void => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      setAmplitude(Math.min(1, rms * 2.2));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [analyser]);

  return amplitude;
}
