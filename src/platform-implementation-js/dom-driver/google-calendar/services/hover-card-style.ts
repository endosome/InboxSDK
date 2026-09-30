/** CSS of the hover card layer. Everything is `calsdk-` prefixed; colours come from a theme attribute, not from Calendar's CSS. */
export function hoverCardStyleText(): string {
  return `
.calsdk-hover-layer { position: fixed; inset: 0; z-index: 4000; pointer-events: none; }
.calsdk-hover-card { position: absolute; left: 0; top: 0; box-sizing: border-box; overflow: auto; padding: 8px 12px; border-radius: 8px;
  font: 400 13px/18px Roboto, Arial, sans-serif; letter-spacing: 0; text-align: start; white-space: normal;
  background: #fff; color: #202124; border: 1px solid rgba(60, 64, 67, 0.2); box-shadow: 0 2px 8px rgba(60, 64, 67, 0.3), 0 1px 2px rgba(60, 64, 67, 0.3); }
.calsdk-hover-card[data-calsdk-theme="dark"] { background: #303134; color: #e8eaed; border-color: rgba(232, 234, 237, 0.24); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6); }
.calsdk-hover-card[data-calsdk-interactive] { pointer-events: auto; }
.calsdk-hover-card__part + .calsdk-hover-card__part { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(128, 128, 128, 0.3); }
`;
}
