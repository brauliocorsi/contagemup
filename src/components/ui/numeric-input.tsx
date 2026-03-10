import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface NumericInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  allowEmpty?: boolean;
  emptyValue?: number;
}

/**
 * NumericInput - A number input that allows clearing and retyping.
 * Uses string state internally so users can delete all digits and type fresh.
 * Converts to number on blur or Enter.
 */
const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ value, onChange, min, max, allowEmpty = false, emptyValue, className, onFocus, onBlur, onKeyDown, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState<string>(String(value));
    const [isFocused, setIsFocused] = React.useState(false);

    // Sync external value when not focused
    React.useEffect(() => {
      if (!isFocused) {
        setDisplayValue(String(value));
      }
    }, [value, isFocused]);

    const clamp = (val: number): number => {
      let result = val;
      if (min !== undefined) result = Math.max(min, result);
      if (max !== undefined) result = Math.min(max, result);
      return result;
    };

    const commitValue = () => {
      const trimmed = displayValue.trim();
      if (trimmed === '' || isNaN(Number(trimmed))) {
        const fallback = emptyValue ?? min ?? 0;
        onChange(fallback);
        setDisplayValue(String(fallback));
      } else {
        const num = clamp(parseInt(trimmed, 10));
        onChange(num);
        setDisplayValue(String(num));
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      // Allow empty, minus sign, or digits
      if (raw === '' || raw === '-' || /^-?\d*$/.test(raw)) {
        setDisplayValue(raw);
      }
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      // Select all text on focus for easy replacement
      e.target.select();
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      commitValue();
      onBlur?.(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        commitValue();
        (e.target as HTMLInputElement).blur();
      }
      onKeyDown?.(e);
    };

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn('[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none', className)}
        {...props}
      />
    );
  }
);

NumericInput.displayName = 'NumericInput';

export { NumericInput };
export type { NumericInputProps };
