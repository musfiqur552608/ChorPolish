'use client';

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileText, Image as ImageIcon, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/hooks/useToastStore';
import { cn } from '@/lib/cn';
import { shareFile } from '@/lib/share';
import type { RoundHistory } from '@/types';
import { ScoreCard } from './ScoreCard';
import type { SheetPlayer } from './ScoreSheet';

interface ExportScoreSheetProps {
  players: SheetPlayer[];
  history: RoundHistory[];
  totalRounds: number;
}

const FILENAME = 'chor-police-scorecard';

function todaySlug(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

async function waitForExport(): Promise<void> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    await document.fonts.ready;
  }
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  // Give the off-screen card a beat to settle its final layout before capture.
  await new Promise<void>((resolve) => setTimeout(resolve, 120));
}

async function captureNode(node: HTMLElement | null, pixelRatio: number): Promise<string> {
  if (!node) throw new Error('EMPTY_CAPTURE');
  await waitForExport();
  const { toPng } = await import('html-to-image');
  return toPng(node, {
    cacheBust: true,
    pixelRatio,
    quality: 1,
    backgroundColor: '#08111a',
  });
}

function CardPreview({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const update = () => {
      const next = host.clientWidth / width;
      setScale(Math.min(1, Math.max(0, next)));
    };

    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div
      ref={hostRef}
      className="relative w-full overflow-hidden rounded-[18px]"
      style={{ height: height * scale }}
    >
      <div
        style={{
          width,
          height,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Renders two purpose-built scorecards (a 1080×1620 share image and a
 * 1240×1754 A4 PDF page) with buttons to download PNG, download PDF, or share
 * the image through the Web Share API.
 *
 * The room code is deliberately never supplied to the cards, so exports stay
 * privacy-safe per the product requirement.
 */
export function ExportScoreSheet({
  players,
  history,
  totalRounds,
}: ExportScoreSheetProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<null | 'png' | 'pdf' | 'share'>(null);
  const [previewFormat, setPreviewFormat] = useState<'image' | 'pdf'>('image');
  const imageRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<HTMLDivElement>(null);

  const openExport = () => setOpen(true);

  const downloadPng = useCallback(async () => {
    setExporting('png');
    try {
      const dataUrl = await captureNode(imageRef.current, 2);
      const link = document.createElement('a');
      link.download = `${FILENAME}-${todaySlug()}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast(t('sheet.downloadedPng'), 'success');
    } catch {
      toast(t('result.downloadError'), 'error');
    } finally {
      setExporting(null);
    }
  }, [t]);

  const downloadPdf = useCallback(async () => {
    setExporting('pdf');
    try {
      const dataUrl = await captureNode(pdfRef.current, 2);
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF('p', 'mm', 'a4');
      pdf.setProperties({
        title: t('sheet.shareTitle'),
        subject: t('sheet.cardTitle'),
        author: t('scorecard.brand'),
        creator: 'Chor Police',
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      pdf.addImage(dataUrl, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
      pdf.save(`${FILENAME}-${todaySlug()}.pdf`);
      toast(t('sheet.downloadedPdf'), 'success');
    } catch {
      toast(t('result.downloadError'), 'error');
    } finally {
      setExporting(null);
    }
  }, [t]);

  const shareScoreSheet = useCallback(async () => {
    setExporting('share');
    try {
      const dataUrl = await captureNode(imageRef.current, 2);
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], `${FILENAME}-${todaySlug()}.png`, {
        type: 'image/png',
      });

      const outcome = await shareFile(
        file,
        t('sheet.shareTitle'),
        t('sheet.shareText'),
      );

      if (outcome === 'shared') {
        toast(t('sheet.shared'), 'success');
      } else if (outcome === 'unsupported') {
        toast(t('sheet.shareUnsupported'), 'info');
      }
      // 'cancelled' is a deliberate user action; stay quiet.
    } catch {
      toast(t('result.shareError'), 'error');
    } finally {
      setExporting(null);
    }
  }, [t]);

  const previewWidth = previewFormat === 'image' ? 1080 : 1240;
  const previewHeight = previewFormat === 'image' ? 1620 : 1754;

  const exportFooter = (
    <div>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
        {t('sheet.exportFormat')}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          variant="secondary"
          size="md"
          onClick={downloadPng}
          loading={exporting === 'png'}
          disabled={exporting !== null}
          data-autofocus
          leftIcon={<Download className="h-4 w-4" aria-hidden />}
        >
          {t('sheet.downloadPng')}
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={downloadPdf}
          loading={exporting === 'pdf'}
          disabled={exporting !== null}
          leftIcon={<FileText className="h-4 w-4" aria-hidden />}
        >
          {t('sheet.downloadPdf')}
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={shareScoreSheet}
          loading={exporting === 'share'}
          disabled={exporting !== null}
          leftIcon={<Share2 className="h-4 w-4" aria-hidden />}
        >
          {t('sheet.share')}
        </Button>
      </div>
      <p className="mt-3 text-[11px] text-ink-faint">{t('sheet.exportPrivacy')}</p>
    </div>
  );

  return (
    <>
      <Button
        variant="paper"
        size="sm"
        onClick={openExport}
        disabled={exporting !== null}
        leftIcon={<FileText className="h-4 w-4" aria-hidden />}
      >
        {t('sheet.exportButton')}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('sheet.exportTitle')}
        description={t('sheet.shareSubtitle')}
        size="xl"
        hideClose={false}
        footer={exportFooter}
      >
        <div className="sticky top-0 z-10 -mx-5 mb-3 flex items-center justify-center gap-2 bg-paper/95 px-5 pb-2 pt-1 backdrop-blur sm:-mx-6 sm:px-6">
          {(['image', 'pdf'] as const).map((format) => {
            const active = previewFormat === format;
            return (
              <button
                key={format}
                type="button"
                aria-pressed={active}
                onClick={() => setPreviewFormat(format)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors',
                  active
                    ? 'border-teal/40 bg-teal/10 text-teal'
                    : 'border-ink/15 bg-paper-light text-ink-soft hover:border-teal/30',
                )}
              >
                {format === 'image' ? (
                  <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                )}
                {t(format === 'image' ? 'sheet.previewCard' : 'sheet.previewPdf')}
              </button>
            );
          })}
        </div>

        <div className="mx-auto w-full max-w-[720px] pb-2">
          <CardPreview width={previewWidth} height={previewHeight}>
            {previewFormat === 'image' ? (
              <ScoreCard
                variant="image"
                players={players}
                history={history}
                totalRounds={totalRounds}
              />
            ) : (
              <ScoreCard
                variant="pdf"
                players={players}
                history={history}
                totalRounds={totalRounds}
              />
            )}
          </CardPreview>
        </div>
      </Modal>

      {open && (
        <div
          aria-hidden
          className="pointer-events-none fixed top-0"
          style={{ left: '-20000px' }}
        >
          <div ref={imageRef}>
            <ScoreCard
              variant="image"
              players={players}
              history={history}
              totalRounds={totalRounds}
            />
          </div>
          <div ref={pdfRef}>
            <ScoreCard
              variant="pdf"
              players={players}
              history={history}
              totalRounds={totalRounds}
            />
          </div>
        </div>
      )}
    </>
  );
}
