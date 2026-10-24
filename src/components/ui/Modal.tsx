import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from './IconButton';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  hideClose?: boolean;
  closeLabel?: string;
  className?: string;
}

const sizes = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  hideClose = false,
  closeLabel = 'Close',
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Keep the latest onClose without making the focus-trap effect re-run on
  // every parent render (inline arrow props change identity constantly).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const preferred = panel.querySelector<HTMLElement>('[data-autofocus]');
      const focusable = panel.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      (preferred ?? focusable ?? panel).focus({ preventScroll: true });
    }, 80);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const nodes = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => node.offsetParent !== null);
      if (nodes.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActive?.focus({ preventScroll: true });
    };
  }, [open]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div
            className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            className={cn(
              'paper relative z-10 flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-[22px] border border-ink/10 sm:rounded-[18px]',
              'shadow-paper-lift',
              sizes[size],
              className,
            )}
            initial={{ y: 42, opacity: 0, scale: 0.985 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.985 }}
            transition={{ type: 'spring', stiffness: 360, damping: 32 }}
          >
            <div className="tape -top-3 left-1/2 -translate-x-1/2 rotate-[-1deg]" aria-hidden />
            <div className="flex items-start gap-4 px-5 pb-2 pt-6 sm:px-6">
              <div className="min-w-0 flex-1">
                {title && (
                  <h2 id={titleId} className="font-display text-xl font-bold leading-snug text-ink sm:text-2xl">
                    {title}
                  </h2>
                )}
                {description && (
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{description}</p>
                )}
              </div>
              {!hideClose && (
                <IconButton label={closeLabel} onClick={onClose} className="-mr-2 -mt-1">
                  <X className="h-5 w-5" aria-hidden />
                </IconButton>
              )}
            </div>
            <div className="scrollbar-paper min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
              {children}
            </div>
            {footer && <div className="border-t border-ink/10 bg-paper-deep/25 px-5 py-4 sm:px-6">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
