/**
 * CSS for buttons injected into event popovers. Uses `currentColor` so it
 * follows Calendar's light/dark theme without detecting it.
 */
export function popoverButtonStyleText(): string {
  return `
.calsdk-popover-actions { display: flex; flex-wrap: wrap; gap: 8px; box-sizing: border-box; padding: 4px 16px 12px 68px; }
.calsdk-popover-button { display: inline-flex; align-items: center; gap: 6px; box-sizing: border-box; height: 32px; padding: 0 12px;
  border: 1px solid currentColor; border-radius: 16px; background: transparent; color: inherit; opacity: 0.85;
  font: 500 13px/32px Roboto, Arial, sans-serif; cursor: pointer; }
.calsdk-popover-button:hover, .calsdk-popover-button:focus-visible { opacity: 1; background: rgba(128, 128, 128, 0.16); }
.calsdk-popover-button__icon { width: 16px; height: 16px; flex: none; }
`;
}
