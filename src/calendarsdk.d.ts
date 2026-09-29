/**
 * Public types of @calendarsdk/core. Handwritten so that the public surface is
 * decoupled from internal classes.
 */
export const LOADER_VERSION: string;

export interface Reporter {
  error(err: unknown, details?: unknown): void;
  event(name: string, details?: unknown): void;
}

export interface AppLogger {
  error(err: Error | unknown, details?: any): void;
  event(name: string, details?: any): void;
}

export interface LoadOptions {
  /** Opaque namespace for your extension. */
  appId: string;
  /** Extra selector candidates PREPENDED to the SDK's bundled chains. */
  selectorOverrides?: Record<string, readonly string[]>;
  /** Called for each override selector dropped as invalid CSS in this browser. */
  onInvalidSelector?: (key: string, selector: string) => void;
  /** Receives SDK diagnostics; defaults to the console. Nothing is sent anywhere. */
  reporter?: Reporter;
}

export interface CalendarSDK {
  readonly LOADER_VERSION: string;
  readonly IMPL_VERSION: string;
  readonly Logger: AppLogger;
  readonly destroyed: boolean;
  destroy(): void;
  on(event: 'destroy', listener: () => void): this;
}

export function load(version: 1, opts: LoadOptions): Promise<CalendarSDK>;

declare const CalendarSDK: {
  load: typeof load;
  LOADER_VERSION: string;
};
export { CalendarSDK };
export default CalendarSDK;
