import { GAME_CONFIG } from '@/config/game';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { sound } from '@/lib/sound';

interface AvatarPickerProps {
  value: string;
  onChange: (avatar: string) => void;
  label?: string;
  disabled?: boolean;
  compact?: boolean;
}

export function AvatarPicker({ value, onChange, label, disabled = false, compact = false }: AvatarPickerProps) {
  return (
    <div>
      {label && <span className="mb-2 block text-sm font-semibold text-ink">{label}</span>}
      <div
        className={cn(
          'grid grid-cols-5 gap-1.5 sm:gap-2',
          compact ? 'max-w-[260px]' : 'max-w-none',
        )}
      >
        {GAME_CONFIG.avatars.map((avatar, index) => {
          const selected = value === avatar;
          return (
            <button
              key={avatar}
              type="button"
              disabled={disabled}
              aria-label={avatar}
              aria-pressed={selected}
              onClick={() => {
                if (selected) return;
                haptics.tap();
                sound.play('click');
                onChange(avatar);
              }}
              className={cn(
                'relative grid aspect-square place-items-center rounded-[12px] border-2 text-2xl transition-all',
                'hover:-translate-y-0.5 hover:border-ink/30 disabled:cursor-not-allowed disabled:opacity-50',
                selected
                  ? 'border-ink bg-mustard/35 shadow-[0_3px_0_rgba(32,51,70,.25)]'
                  : 'border-ink/10 bg-paper-light/80',
              )}
              style={{ transform: `rotate(${((index % 3) - 1) * 1.3}deg)` }}
            >
              <span aria-hidden>{avatar}</span>
              {selected && (
                <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full border border-ink bg-teal text-[10px] text-white">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
