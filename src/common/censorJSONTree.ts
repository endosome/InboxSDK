/**
 * JSON-stringifies `object` with every string longer than 10 characters
 * replaced by `...`, so the result can be shared without leaking content.
 */
export default function censorJSONTree(object: any): string {
  return JSON.stringify(object, (key, value) => {
    if (typeof value !== 'string' || value.length <= 10) return value;
    return '...';
  });
}
