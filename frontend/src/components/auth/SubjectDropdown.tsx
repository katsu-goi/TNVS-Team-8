import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface SubjectDropdownProps {
  id: string;
  labelId: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}

/**
 * Accessible custom dropdown that mirrors the app's glassmorphism styling.
 * Replaces the native <select> whose option list cannot be styled across
 * browsers (white native popup). Supports keyboard navigation, focus state,
 * ARIA roles, outside-click closing and automatic open-up/open-down placement.
 */
export const SubjectDropdown: React.FC<SubjectDropdownProps> = ({
  id,
  labelId,
  value,
  onChange,
  options,
}) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, options.indexOf(value))
  );
  const [openUp, setOpenUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedIndex = options.indexOf(value);

  const openMenu = () => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const estimatedHeight = options.length * 44 + 12;
      setOpenUp(rect.bottom + estimatedHeight > window.innerHeight);
    }
    setOpen(true);
  };

  const selectOption = (index: number) => {
    onChange(options[index]);
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const active = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`
    );
    active?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % options.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + options.length) % options.length);
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (activeIndex >= 0) selectOption(activeIndex);
        break;
      case 'Tab':
      case 'Escape':
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border border-white/15 bg-white/10 text-white text-sm text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#D02F34] focus:border-transparent transition-shadow"
      >
        <span className="truncate">{value}</span>
        <ChevronDown
          className={`w-4 h-4 text-white/50 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={`${id}-listbox`}
          role="listbox"
          aria-labelledby={labelId}
          style={openUp ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }}
          className="absolute left-0 right-0 z-50 max-h-[220px] overflow-y-auto rounded-xl border border-white/25 bg-[rgba(15,15,15,0.88)] backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.55)] py-1.5"
        >
          {options.map((option, index) => {
            const selected = option === value;
            const active = index === activeIndex;
            return (
              <li
                key={option}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={selected}
                data-index={index}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectOption(index)}
                className={`px-4 py-2.5 text-sm cursor-pointer select-none transition-colors ${
                  active
                    ? 'bg-[#D02F34]/20 text-[#FFC629]'
                    : selected
                      ? 'bg-white/10 text-white'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                {option}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
