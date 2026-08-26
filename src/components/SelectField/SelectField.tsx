import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export type SelectFieldOption = {
  label: string;
  value: string;
};

type SelectFieldProps = {
  icon?: ReactNode;
  label: string;
  onChange: (value: string) => void;
  options: SelectFieldOption[];
  value: string;
};

export function SelectField({ icon, label, onChange, options, value }: SelectFieldProps) {
  const generatedId = useId().replaceAll(':', '');
  const fieldRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex);
  const selectedOption = options[selectedIndex] ?? options[0];
  const listboxId = `select-field-${generatedId}`;

  useEffect(() => {
    if (!isOpen) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!fieldRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [isOpen]);

  function open() {
    setHighlightedIndex(selectedIndex);
    setIsOpen(true);
  }

  function close() {
    setIsOpen(false);
  }

  function select(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    close();
    triggerRef.current?.focus();
  }

  function moveHighlight(step: number) {
    setHighlightedIndex((current) => {
      const next = current + step;
      if (next < 0) return options.length - 1;
      if (next >= options.length) return 0;
      return next;
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) open();
      else moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (event.key === 'Home' && isOpen) {
      event.preventDefault();
      setHighlightedIndex(0);
      return;
    }

    if (event.key === 'End' && isOpen) {
      event.preventDefault();
      setHighlightedIndex(options.length - 1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isOpen) select(highlightedIndex);
      else open();
      return;
    }

    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === 'Tab') close();
  }

  return (
    <div className={`select-field ${isOpen ? 'is-open' : ''}`} ref={fieldRef}>
      {icon && <span className="select-field__icon">{icon}</span>}
      <button
        aria-activedescendant={isOpen ? `${listboxId}-option-${highlightedIndex}` : undefined}
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={label}
        className="select-field__trigger"
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={handleKeyDown}
        ref={triggerRef}
        role="combobox"
        type="button"
      >
        <span className="select-field__value">{selectedOption?.label}</span>
        <ChevronDown aria-hidden="true" className="select-field__chevron" size={17} />
      </button>
      {isOpen && (
        <div aria-label={label} className="select-field__menu" id={listboxId} role="listbox">
          {options.map((option, index) => (
            <button
              aria-selected={option.value === value}
              className={`select-field__option ${index === highlightedIndex ? 'is-highlighted' : ''}`}
              id={`${listboxId}-option-${index}`}
              key={`${option.value}-${option.label}`}
              onClick={() => select(index)}
              onMouseEnter={() => setHighlightedIndex(index)}
              role="option"
              tabIndex={-1}
              type="button"
            >
              <span>{option.label}</span>
              {option.value === value && <Check aria-hidden="true" size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
