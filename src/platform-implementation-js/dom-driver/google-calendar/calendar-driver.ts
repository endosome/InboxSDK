import kefirStopper from 'kefir-stopper';
import type { Stopper } from 'kefir-stopper';
import type { Driver, UserInfo } from '../../driver-interfaces/driver';
import type { RouteViewDriver } from '../../driver-interfaces/route-view-driver';
import type { EventViewDriver } from '../../driver-interfaces/event-view-driver';
import type { EventEditorViewDriver } from '../../driver-interfaces/event-editor-view-driver';
import type { EventPopoverViewDriver } from '../../driver-interfaces/event-popover-view-driver';
import SelectorRegistry from '../../lib/dom/selectorRegistry';
import type { InvalidSelectorReporter } from '../../lib/dom/mergeSelectorOverrides';
import waitFor from '../../lib/wait-for';
import { reportEvent } from '../../lib/reporter';
import {
  CALENDAR_SELECTORS,
  type CalendarSelectorKey,
  type SelectorOverrides,
} from './selectors';
import type { GotoTarget } from './route-url';
import RouteService from './services/route-service';
import EventRegistry from './services/event-registry';
import InjectionReconciler from './services/injection-reconciler';
import ToolbarService from './services/toolbar-service';
import type {
  ToolbarButtonDescriptor,
  ToolbarButtonHandle,
} from '../../driver-interfaces/toolbar-driver';
import CompatService from './services/compat-service';
import type { CompatIssue, CompatReport } from '../../compat/types';
import EditorService from './services/editor-service';
import CalendarIdMap from './services/calendar-id-map';
import PopoverRegistry from './services/popover-registry';
import { readUserInfo } from './services/user-info';

export type CalendarDriverOptions = {
  selectorOverrides?: SelectorOverrides;
  onInvalidSelector?: InvalidSelectorReporter;
  /** How long to wait for Calendar to render its user info. */
  readyTimeoutMs?: number;
};

/**
 * Composition root for the Google Calendar integration: owns the lifetime and
 * composes the services (route, user info; observer/identity/views come in
 * later phases, see docs/calendar-sdk-plan.md §3). Keep logic in the services.
 */
export default class CalendarDriver implements Driver {
  readonly selectors: SelectorRegistry<CalendarSelectorKey>;
  /** Resolves once user info is available and routing has started. */
  readonly onready: Promise<void>;
  readonly #appId: string;
  readonly #stopper: Stopper = kefirStopper();
  #userInfo: UserInfo | null = null;
  #routeService: RouteService | null = null;
  #eventRegistry: EventRegistry | null = null;
  #reconciler: InjectionReconciler | null = null;
  #popoverRegistry: PopoverRegistry | null = null;
  #editorService: EditorService | null = null;
  #compatService: CompatService | null = null;
  #toolbarService: ToolbarService | null = null;
  readonly #idMap = new CalendarIdMap();
  #destroyed = false;

  constructor(appId: string, options: CalendarDriverOptions = {}) {
    this.#appId = appId;
    this.selectors = new SelectorRegistry<CalendarSelectorKey>(
      CALENDAR_SELECTORS,
      {
        overrides: options.selectorOverrides,
        onInvalidSelector: options.onInvalidSelector,
      },
    );
    this.onready = this.#start(options.readyTimeoutMs ?? 15_000);
  }

  async #start(timeoutMs: number): Promise<void> {
    try {
      this.#userInfo = await waitFor(
        () => readUserInfo(document),
        timeoutMs,
        100,
      );
    } catch (err) {
      throw new Error(
        "CalendarSDK: Google Calendar's user info (#xUserInfo) did not appear " +
          `within ${timeoutMs} ms. Is this a signed-in Calendar page?`,
        { cause: err },
      );
    }
    if (this.#destroyed) return;
    this.#routeService = new RouteService({
      document,
      location,
      window,
      navigation: (globalThis as any).navigation,
      resolveCalendarId: (hint) => this.#idMap.resolve(hint),
      onDisagreement: (input, descriptor) =>
        reportEvent('route-disagreement', { input, type: descriptor.type }),
    });
    this.#routeService.start();
    // A route change rebuilds the grid: re-check every chip.
    this.#routeService.subscribe(() => this.#eventRegistry?.reconcileAll());
    this.#reconciler = new InjectionReconciler({
      document,
      appId: this.#appId,
      getDriverForElement: (el) => this.#eventRegistry?.getDriverForElement(el),
    });
    this.#eventRegistry = new EventRegistry(
      document,
      this.selectors,
      this.#reconciler,
      this.#idMap,
    );
    this.#eventRegistry.start();
    this.#reconciler.start();
    this.#popoverRegistry = new PopoverRegistry({
      document,
      selectors: this.selectors,
      appId: this.#appId,
      resolveCalendarId: (hint) => this.#idMap.resolve(hint),
      // a popover has no jslog: borrow the full calendar id from a chip of the same event
      lookupCalendarId: (rawId) =>
        this.#eventRegistry
          ?.getAll()
          .find((d) => d.getEventRef().rawId === rawId)
          ?.getEventRef().calendarId ?? null,
    });
    this.#popoverRegistry.start();
    this.#editorService = new EditorService(
      this.#routeService,
      document,
      this.selectors,
    );
    this.#editorService.start();
    this.#toolbarService = new ToolbarService({
      document,
      selectors: this.selectors,
      appId: this.#appId,
    });
    this.#toolbarService.start();
    this.#compatService = new CompatService(document, this.selectors);
    this.#compatService.start(this.#routeService);
  }

  getAppId(): string {
    return this.#appId;
  }

  getStopper(): Stopper {
    return this.#stopper;
  }

  getUserInfo(): UserInfo {
    if (!this.#userInfo) throw new Error('CalendarDriver is not ready');
    return this.#userInfo;
  }

  getCurrentRouteViewDriver(): RouteViewDriver {
    if (!this.#routeService) throw new Error('CalendarDriver is not ready');
    return this.#routeService.getCurrent();
  }

  onRouteViewDriver(cb: (driver: RouteViewDriver) => void): () => void {
    if (!this.#routeService) throw new Error('CalendarDriver is not ready');
    return this.#routeService.subscribe(cb);
  }

  goto(target: GotoTarget): Promise<void> {
    if (!this.#routeService)
      return Promise.reject(new Error('CalendarDriver is not ready'));
    try {
      return this.#routeService.goto(target);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  getEventViewDrivers(): EventViewDriver[] {
    if (!this.#eventRegistry) throw new Error('CalendarDriver is not ready');
    return this.#eventRegistry.getAll();
  }

  onEventViewDriver(cb: (driver: EventViewDriver) => void): () => void {
    if (!this.#eventRegistry) throw new Error('CalendarDriver is not ready');
    return this.#eventRegistry.subscribe(cb);
  }

  getEventPopoverViewDrivers(): EventPopoverViewDriver[] {
    if (!this.#popoverRegistry) throw new Error('CalendarDriver is not ready');
    return this.#popoverRegistry.getAll();
  }

  onEventPopoverViewDriver(
    cb: (driver: EventPopoverViewDriver) => void,
  ): () => void {
    if (!this.#popoverRegistry) throw new Error('CalendarDriver is not ready');
    return this.#popoverRegistry.subscribe(cb);
  }

  getEventEditorViewDrivers(): EventEditorViewDriver[] {
    if (!this.#editorService) throw new Error('CalendarDriver is not ready');
    return this.#editorService.getAll();
  }

  onEventEditorViewDriver(
    cb: (driver: EventEditorViewDriver) => void,
  ): () => void {
    if (!this.#editorService) throw new Error('CalendarDriver is not ready');
    return this.#editorService.subscribe(cb);
  }

  addToolbarButton(descriptor: ToolbarButtonDescriptor): ToolbarButtonHandle {
    if (!this.#toolbarService) throw new Error('CalendarDriver is not ready');
    return this.#toolbarService.addButton(descriptor);
  }

  getCompatReport(): CompatReport {
    if (!this.#compatService) throw new Error('CalendarDriver is not ready');
    return this.#compatService.getReport();
  }

  onCompatIssue(cb: (issue: CompatIssue) => void): () => void {
    if (!this.#compatService) throw new Error('CalendarDriver is not ready');
    return this.#compatService.onIssue(cb);
  }

  destroy(): void {
    this.#destroyed = true;
    this.#compatService?.stop();
    this.#toolbarService?.stop();
    this.#editorService?.stop();
    this.#popoverRegistry?.stop();
    this.#reconciler?.stop();
    this.#eventRegistry?.stop();
    this.#routeService?.stop();
    this.#stopper.destroy();
  }
}
