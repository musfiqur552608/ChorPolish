import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { RoleSlip } from '@/components/roles/RoleSlip';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-paper px-5 py-12">
      <div className="absolute left-[9%] top-[18%] -rotate-12 opacity-50">
        <RoleSlip role="CHOR" size="md" />
      </div>
      <div className="absolute bottom-[14%] right-[10%] rotate-12 opacity-50">
        <RoleSlip role="POLICE" size="md" />
      </div>
      <div className="paper relative w-full max-w-lg rounded-sm p-7 text-center sm:p-10">
        <div className="tape -top-3 left-10 rotate-[-5deg]" aria-hidden />
        <Logo className="justify-center" />
        <p className="mt-8 font-hand text-7xl font-bold leading-none text-terracotta">৪০৪</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">{t('notFound.title')}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">{t('notFound.body')}</p>
        <Link
          to="/"
          className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] border-2 border-ink bg-ink px-5 font-semibold text-paper-light shadow-[0_4px_0_#b84b3d] transition-transform active:translate-y-0.5"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t('notFound.cta')}
        </Link>
      </div>
    </main>
  );
}
