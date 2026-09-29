import type { Driver } from '../driver-interfaces/driver';
import type {
  ToolbarButtonDescriptor,
  ToolbarButtonHandle,
} from '../driver-interfaces/toolbar-driver';

/** Buttons in Calendar's top bar. */
export default class Toolbar {
  readonly #driver: Driver;

  constructor(driver: Driver) {
    this.#driver = driver;
  }

  /**
   * Add an icon button next to Calendar's Search button. The SDK keeps it in
   * place when Calendar re-renders the bar and removes it when the SDK is
   * destroyed or `remove()` is called.
   */
  addButton(descriptor: ToolbarButtonDescriptor): ToolbarButtonHandle {
    return this.#driver.addToolbarButton(descriptor);
  }
}
