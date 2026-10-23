import { useTranslation } from 'react-i18next';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';
import { RoleSlip } from '@/components/roles/RoleSlip';
import type { Role } from '@/types';

interface HowToPlayModalProps {
  open: boolean;
  onClose: () => void;
}

const roles: Role[] = ['BABU', 'POLICE', 'CHOR', 'DAKAT'];

export function HowToPlayModal({ open, onClose }: HowToPlayModalProps) {
  const { t } = useTranslation();
  const steps = t('howTo.steps', { returnObjects: true }) as Array<{ title: string; body: string }>;
  const scoreRows = t('howTo.scoreRows', { returnObjects: true }) as Record<Role, string>;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {t('howTo.title')} <Sparkles className="h-5 w-5 text-mustard" aria-hidden />
        </span>
      }
      description={t('howTo.shot')}
      size="lg"
      footer={
        <Button onClick={onClose} fullWidth size="lg">
          {t('howTo.close')}
        </Button>
      }
    >
      <article className="space-y-7 pb-2">
        <section className="relative rounded-sm border border-ink/10 bg-paper-deep/30 p-4 sm:p-5">
          <span className="font-hand text-2xl font-bold text-terracotta">{t('howTo.introTitle')}</span>
          <p className="mt-2 text-sm leading-7 text-ink-soft">{t('howTo.intro')}</p>
          <p className="mt-3 rotate-[-1.5deg] font-hand text-lg text-ink">— back bench, class six</p>
        </section>

        <section>
          <h3 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-[11px] text-paper">১</span>
            {t('howTo.stepsTitle')}
          </h3>
          <ol className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="relative rounded-lg border border-ink/10 bg-paper-light/75 p-3.5"
              >
                <span className="absolute right-3 top-2 font-hand text-2xl font-bold text-mustard">
                  {index + 1}
                </span>
                <h4 className="pr-6 text-sm font-bold leading-snug text-ink">{step.title}</h4>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h3 className="font-display text-lg font-bold text-ink">{t('howTo.scoreTitle')}</h3>
          <div className="mt-2.5 overflow-hidden rounded-lg border border-ink/10">
            {roles.map((role, index) => (
              <div
                key={role}
                className={`flex items-center gap-3 px-3 py-2.5 ${
                  index % 2 === 0 ? 'bg-paper-light/80' : 'bg-paper-deep/25'
                }`}
              >
                <RoleSlip role={role} size="xs" showBrand={false} className="rotate-[-2deg]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">
                    {t(`roles.${role}.name`)}
                    <span className="ml-2 font-hand text-lg font-semibold text-terracotta">
                      {t(`roles.${role}.points`)}
                    </span>
                  </p>
                  <p className="text-[12px] leading-snug text-ink-soft">{scoreRows[role]}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border-2 border-dashed border-teal/30 bg-teal/[0.04] p-3.5">
            <h3 className="font-display font-bold text-ink">{t('howTo.orderTitle')}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{t('howTo.orderBody')}</p>
          </div>
          <div className="rounded-lg border-2 border-dashed border-terracotta/25 bg-terracotta/[0.03] p-3.5">
            <h3 className="font-display font-bold text-ink">{t('howTo.outcomeTitle')}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{t('howTo.outcome')}</p>
            <p className="mt-2 flex items-start gap-1.5 font-hand text-base leading-snug text-terracotta">
              <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden />
              {t('howTo.loserNote')}
            </p>
          </div>
        </section>
      </article>
    </Modal>
  );
}
