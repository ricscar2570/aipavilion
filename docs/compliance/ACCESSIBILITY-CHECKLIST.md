# WCAG 2.2 AA pilot checklist

Automated checks cannot establish conformance. Complete this checklist with keyboard, screen-reader, zoom and mobile testing before the public pilot.

## Global

- [ ] Every route has one descriptive page heading.
- [ ] Skip link reaches the main content.
- [ ] Focus order follows visual and logical order.
- [ ] Focus is visible at 200% zoom and in high-contrast modes.
- [ ] No action requires pointer hover.
- [ ] Text and controls meet contrast requirements.
- [ ] Status and validation messages use live regions where appropriate.
- [ ] Reduced-motion preference is respected.
- [ ] Reflow works at 320 CSS pixels without two-dimensional scrolling, except essential tables.

## Authentication and account

- [ ] Labels, instructions and errors are programmatically associated.
- [ ] Password requirements are available before submission.
- [ ] Verification and recovery flows do not rely only on memory or puzzles.
- [ ] Session-expiry recovery preserves non-sensitive work where possible.

## Organizer and exhibitor portals

- [ ] Event, invitation, membership and lead tables have meaningful headers.
- [ ] Details/summary controls announce state correctly.
- [ ] Destructive actions communicate consequences and offer error recovery.
- [ ] Date/time fields expose timezone context.
- [ ] Loading, empty, error and success states are announced.

## Public experience

- [ ] Stand and event cards have accessible names.
- [ ] Gallery controls are keyboard operable.
- [ ] Images have appropriate alternative text.
- [ ] Video has captions/transcript requirements for uploaded content.
- [ ] Contact form privacy acknowledgement is understandable.
- [ ] Turnstile is tested with its accessible interaction and fallback behavior.

## Test matrix

- [ ] Keyboard only in current Chrome and Firefox.
- [ ] NVDA with Firefox or Chrome on Windows.
- [ ] VoiceOver with Safari on macOS/iOS.
- [ ] 200% and 400% zoom.
- [ ] Mobile portrait and landscape.
- [ ] Automated axe or equivalent scan with zero serious/critical findings.

Record defects, evidence and retest results. Do not claim WCAG conformance until a qualified manual review is complete.
