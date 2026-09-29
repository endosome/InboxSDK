import { BUILD_VERSION } from '../common/version';
import {
  makePlatformImplementation,
  type PiOpts,
  type PlatformImplementation,
} from '../platform-implementation-js/platform-implementation';

export const LOADER_VERSION = BUILD_VERSION;

export type LoadOptions = Omit<PiOpts, 'REQUESTED_API_VERSION' | 'VERSION'>;

/**
 * Load the SDK in a content script running on https://calendar.google.com.
 * Rejects on any other origin or unsupported API version.
 */
export async function load(
  version: number,
  opts: LoadOptions,
): Promise<PlatformImplementation> {
  return makePlatformImplementation({
    ...opts,
    REQUESTED_API_VERSION: +version,
    VERSION: LOADER_VERSION,
  });
}

/** `CalendarSDK.load(1, { appId })` */
export const CalendarSDK = { load, LOADER_VERSION };
export default CalendarSDK;
