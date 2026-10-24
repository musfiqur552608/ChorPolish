'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { Download, FileText, Share2 } from 'lucide-react';
import { ScoreSheet, type SheetPlayer } from './ScoreSheet';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/hooks/useToastStore';
import { shareFile } from '@/lib/share';
import type { RoundHistory } from '@/types';

interface ExportScoreSheetProps {
  players: SheetPlayer[];
  history: RoundHistory[];
  totalRounds: number;
}

const FILENAME = 'chor-police-score-sheet';

/**
 * Renders the handwritten score sheet in capture mode (fixed width, no room
 * code) inside a modal, with buttons to download PNG, download PDF, or share
 * via the Web Share API.
 *
 * The room code is deliberately never passed to ScoreSheet here, so exports
 * stay privacy-safe per the product requirement.
 */
export function ExportScoreSheet({
  players,
  history,
  totalRounds,
}: ExportScoreSheetProps) {
  const { t } = useTranslation();

  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const openExport = () => setOpen(true);

  const capturePng = useCallback(async (): Promise<string | null> => {
    if (!sheetRef.current) return null;
    return toPng(sheetRef.current, {
      quality: 1,
      pixelRatio: 2,
      cacheBust: true,
    });
  }, []);

  const downloadPng = useCallback(async () => {
    setExporting(true);
    try {
      const dataUrl = await capturePng();
      if (!dataUrl) return;
      const link = document.createElement('a');
      link.download = `${FILENAME}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast(t('sheet.downloadedPng'), 'success');
    } catch {
      toast(t('result.downloadError'), 'error');
    } finally {
      setExporting(false);
    }
  }, [capturePng, t]);

  const downloadPdf = useCallback(async () => {
    setExporting(true);
    try {
      const dataUrl = await capturePng();
      if (!dataUrl) return;
      const img = new Image();
      img.src = dataUrl;
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      if (!img.width || !img.height) throw new Error('EMPTY_CAPTURE');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(
        pageWidth / img.width,
        pageHeight / img.height,
      );
      const dx = (pageWidth - img.width * ratio) / 2;
      const dy = (pageHeight - img.height * ratio) / 2;
      pdf.addImage(dataUrl, 'PNG', dx, dy, img.width * ratio, img.height * ratio);
      pdf.save(`${FILENAME}.pdf`);
      toast(t('sheet.downloadedPdf'), 'success');
    } catch {
      toast(t('result.downloadError'), 'error');
    } finally {
      setExporting(false);
    }
  }, [capturePng, t]);

  const shareScoreSheet = useCallback(async () => {
    setExporting(true);
    try {
      const dataUrl = await capturePng();
      if (!dataUrl) return;
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File(
        [blob],
        `${FILENAME}.png`,
        { type: 'image/png' },
      );

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
      setExporting(false);
    }
  }, [capturePng, t]);

  return (
    <>
      <Button
        variant="paper"
        size="sm"
        onClick={openExport}
        disabled={exporting}
        leftIcon={<FileText className="h-4 w-4" aria-hidden />}
      >
        {t('sheet.exportButton')}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('sheet.title')}
        description={t('sheet.shareSubtitle')}
        size="xl"
        hideClose={false}
      >
        <div className="flex items-center justify-center pt-2 pb-4">
          <div ref={sheetRef} className="w-[780px] sm:w-auto">
            <ScoreSheet
              captureMode
              players={players}
              history={history}
              totalRounds={totalRounds}
            />
          </div>
        </div>
        <div className="border-t border-ink/10 bg-paper-deep/25 px-5 py-4 sm:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-3">
            {t('sheet.exportFormat')}
          </p>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            <Button
              variant="secondary"
              size="md"
              onClick={downloadPng}
              loading={exporting}
              disabled={exporting}
              leftIcon={<Download className="h-4 w-4" aria-hidden />}
            >
              {t('sheet.downloadPng')}
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={downloadPdf}
              loading={exporting}
              disabled={exporting}
              leftIcon={<FileText className="h-4 w-4" aria-hidden />}
            >
              {t('sheet.downloadPdf')}
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={shareScoreSheet}
              loading={exporting}
              disabled={exporting}
              leftIcon={<Share2 className="h-4 w-4" aria-hidden />}
            >
              {t('sheet.share')}
            </Button>
          </div>
          <p className="mt-3 text-[11px] text-ink-faint">
            {t('sheet.exportPrivacy')}
          </p>
        </div>
      </Modal>
    </>
  );
}
