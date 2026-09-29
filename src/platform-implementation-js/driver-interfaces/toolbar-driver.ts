export type ToolbarButtonDescriptor = {
  /** Tooltip and accessible name. */
  title: string;
  /** Icon URL: a `data:` URL, a `chrome-extension://` web-accessible resource or any https image. */
  iconUrl: string;
  onClick: () => void;
};

/** Returned by `Toolbar.addButton`. */
export type ToolbarButtonHandle = {
  update(changes: Partial<ToolbarButtonDescriptor>): void;
  remove(): void;
};
