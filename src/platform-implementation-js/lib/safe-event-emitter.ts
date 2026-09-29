import EventEmitter from 'events';
import { reportError } from './reporter';

/* eslint-disable prefer-rest-params */

// Version of EventEmitter where any exceptions thrown by event handlers are
// caught. This is used to catch exceptions from application code.
export default class SafeEventEmitter extends EventEmitter {
  emit(_event: string, ..._args: Array<any>): boolean {
    try {
      return super.emit.apply(this, arguments as any);
    } catch (e) {
      reportError(e);
      return true;
    }
  }
}
