import { lazy, Suspense, useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Toaster } from '@/components/ui/Toaster';
import { useSettingsStore } from '@/hooks/useSettingsStore';
import { applyTheme, resolveIsDark } from '@/lib/theme';
import { PublicSiteEffects } from '@/features/site/PublicSiteEffects';
import { LandingPage } from '@/features/lobby/LandingPage';
import { NotFoundPage } from '@/features/shell/NotFoundPage';
import { RoomRoute } from '@/features/room/RoomRoute';

const AdminPage = lazy(() =>
  import('@/features/admin/AdminPage').then((module) => ({ default: module.AdminPage })),
);

export default function App() {
  const { t } = useTranslation();
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
        <PublicSiteEffects />
        <Suspense
          fallback={
            <LoadingScreen
              title={t('admin.loadingTitle')}
              subtitle={t('admin.loadingBody')}
            />
          }
        >
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/room/:code" element={<RoomRoute />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
        <Toaster />
      </ErrorBoundary>
    </MotionConfig>
  );
}
