/**
 * Sink for SDK diagnostics. Nothing in the SDK sends data anywhere by itself:
 * the default reporter only writes errors to the console, and an embedder can
 * install its own with {@link setReporter}.
 */
export interface Reporter {
  error(err: unknown, details?: unknown): void;
  event(name: string, details?: unknown): void;
}

/** What extension code gets on `sdk.Logger` (shape kept from InboxSDK). */
export interface AppLogger {
  error(err: Error | unknown, details?: any): void;
  event(name: string, details?: any): void;
}

const consoleReporter: Reporter = {
  error(err, details) {
    if (details === undefined) console.error(err);
    else console.error(err, details);
  },
  event() {
    // events are dropped unless a reporter is installed
  },
};

let current: Reporter = consoleReporter;

/** Install a reporter; `null` restores the console default. */
export function setReporter(reporter: Reporter | null) {
  current = reporter ?? consoleReporter;
}

/** Never throws: a broken reporter must not break the SDK. */
export function reportError(err: unknown, details?: unknown) {
  try {
    current.error(err, details);
  } catch {
    // ignore
  }
}

export function reportEvent(name: string, details?: unknown) {
  try {
    current.event(name, details);
  } catch {
    // ignore
  }
}
