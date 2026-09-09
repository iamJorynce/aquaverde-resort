'use client'

import { useEffect, useRef, useState } from 'react'

interface NumberFieldProps {
  value: number
  onChange: (n: number) => void
  className?: string
  placeholder?: string
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  id?: string
  autoFocus?: boolean
}

// A plain <input type="number"> forces its displayed value to always be a
// valid number, so the common `value={form.x}` + `onChange={e =>
// setForm(p => ({...p, x: parseFloat(e.target.value) || 0}))}` pattern
// makes the field impossible to fully clear while typing — the instant the
// last digit is deleted, `parseFloat('') || 0` snaps the state (and the
// input) straight back to showing "0", fighting the person's cursor.
//
// This wraps a text input with its own internal text buffer, so the field
// can sit empty while being edited. It only commits back to a real number
// (0, if left blank) on blur. Drop-in replacement for a number input: same
// value/onChange(number) contract as before, no change needed to the
// parent's state shape.
export default function NumberField({ value, onChange, className, min, max, step, ...rest }: NumberFieldProps) {
  const [text, setText] = useState(value === 0 ? '' : String(value))
  // Tracks the last number we ourselves sent up via onChange, so the sync
  // effect below can tell "the parent echoed my own edit back" apart from
  // "the parent changed this value for some other reason (e.g. form
  // reset)" — otherwise every keystroke's round-trip through parent state
  // would immediately overwrite whatever the person is mid-typing.
  const lastEmitted = useRef(value)

  useEffect(() => {
    if (value !== lastEmitted.current) {
      setText(value === 0 ? '' : String(value))
      lastEmitted.current = value
    }
  }, [value])

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={e => {
        const raw = e.target.value
        // Allow empty, digits, one leading minus, one decimal point —
        // reject anything else instead of silently mangling what's typed.
        if (raw === '' || /^-?\d*\.?\d*$/.test(raw)) {
          setText(raw)
          const n = parseFloat(raw)
          if (!isNaN(n)) {
            lastEmitted.current = n
            onChange(n)
          }
        }
      }}
      onBlur={() => {
        // Left empty, or as a stray "-" / "." with nothing else — commit
        // to 0 so the display and the parent's actual state agree again.
        let n = parseFloat(text)
        if (isNaN(n)) n = 0
        if (min !== undefined) n = Math.max(min, n)
        if (max !== undefined) n = Math.min(max, n)
        lastEmitted.current = n
        setText(n === 0 ? '' : String(n))
        onChange(n)
      }}
      className={className}
      {...rest}
    />
  )
}
