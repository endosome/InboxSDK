/**
 * CSS for injected badges. Works on light and dark themes (dark translucent pill,
 * white text) and at every density (tiny fixed font, no reliance on chip height).
 */
export function badgeStyleText(): string {
  return `
.calsdk-badges { z-index: 2; display: inline-flex; gap: 2px; align-items: center; pointer-events: auto; }
.calsdk-badges--corner { position: absolute; top: 1px; right: 2px; max-width: 70%; }
.calsdk-badges--inline { float: right; margin: 0 4px; }
.calsdk-badge { display: inline-flex; align-items: center; gap: 2px; box-sizing: border-box; height: 14px; max-width: 100%;
  padding: 0 4px; border-radius: 7px; background: rgba(32, 33, 36, 0.78); color: #fff;
  font: 500 10px/14px Roboto, Arial, sans-serif; letter-spacing: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.calsdk-badge--clickable { cursor: pointer; }
.calsdk-badge--clickable:hover { background: rgba(32, 33, 36, 0.95); }
.calsdk-badge__icon { width: 10px; height: 10px; flex: none; }
`;
}
