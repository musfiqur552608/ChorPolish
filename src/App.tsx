import { useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import { Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Toaster } from '@/components/ui/Toaster';
import { useSettingsStore } from '@/hooks/useSettingsStore';
import { applyTheme, resolveIsDark } from '@/lib/theme';
import { LandingPage } from '@/features/lobby/LandingPage';
import { NotFoundPage } from '@/features/shell/NotFoundPage';
import { RoomRoute } from '@/features/room/RoomRoute';

export default function App() {
  const reduceMotion = useSettingsStore((state) => state.reduceMotion);
  const language = useSettingsStore((state) => state.language);
  const theme = useSettingsStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.classList.toggle('bn', language === 'bn');
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [language, reduceMotion]);

  useEffect(() => {
    const apply = () =>
      applyTheme({
        theme,
        isDark: resolveIsDark(theme),
      });
    apply();
    if (theme !== 'system' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/room/:code" element={<RoomRoute />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <Toaster />
      </ErrorBoundary>
    </MotionConfig>
  );
}
