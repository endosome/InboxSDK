import HandlerRegistry from '../lib/handler-registry';
import type Membrane from '../lib/Membrane';
import type { Driver } from '../driver-interfaces/driver';
import { RouteType } from '../constants/router';
import type RouteView from '../views/route-view/route-view';

export default class Router {
  readonly RouteTypes: typeof RouteType = RouteType;
  readonly #driver: Driver;
  readonly #membrane: Membrane;
  readonly #registry = new HandlerRegistry<RouteView>();

  constructor(driver: Driver, membrane: Membrane) {
    this.#driver = driver;
    this.#membrane = membrane;
    // The current route counts as a target so late handlers still see it.
    this.#registry.addTarget(
      membrane.get(driver.getCurrentRouteViewDriver()) as RouteView,
    );
    const unsubscribe = driver.onRouteViewDriver((routeDriver) => {
      this.#registry.addTarget(membrane.get(routeDriver) as RouteView);
    });
    driver.getStopper().onValue(() => {
      unsubscribe();
      this.#registry.dumpHandlers();
    });
  }

  getCurrentRouteView(): RouteView {
    return this.#membrane.get(this.#driver.getCurrentRouteViewDriver());
  }

  /**
   * Called for the current route and for every later route. Returns a function
   * that unregisters the handler.
   */
  registerRouteViewHandler(
    handler: (routeView: RouteView) => void,
  ): () => void {
    return this.#registry.registerHandler(handler);
  }
}
