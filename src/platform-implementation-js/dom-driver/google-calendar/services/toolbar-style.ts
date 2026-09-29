/** CSS for the toolbar buttons: round icon buttons like Calendar's own; theme-neutral hover. */
export function toolbarStyleText(): string {
  return `
.calsdk-toolbar { display: inline-flex; align-items: center; vertical-align: top; flex: none; }
.calsdk-toolbar-button { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; width: 40px; height: 40px; margin: 0 1px;
  padding: 8px; border: 0; border-radius: 50%; background: transparent; cursor: pointer; }
.calsdk-toolbar-button:hover { background: rgba(128, 128, 128, 0.22); }
.calsdk-toolbar-button:focus-visible { outline: 2px solid #1a73e8; outline-offset: -2px; }
.calsdk-toolbar-button img { width: 24px; height: 24px; display: block; pointer-events: none; }
`;
}
