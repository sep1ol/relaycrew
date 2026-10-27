/** @param {unknown} value @returns {string|undefined} */
function bearerToken(value) {
  if (typeof value !== 'string') return undefined;
  return /^[\t ]*Bearer[\t ]+([^\s,]+)[\t ]*$/i.exec(value)?.[1];
}

/** @param {any} req @param {string} name @returns {string|undefined} */
function singleHeader(req, name) {
  const value = req.headers?.[name];
  if (typeof value !== 'string') return undefined;
  if (req.headersDistinct?.[name]?.length > 1) return undefined;
  let count = 0;
  for (let i = 0; i < (req.rawHeaders?.length ?? 0); i += 2) {
    if (req.rawHeaders[i].toLowerCase() === name) count++;
  }
  return count > 1 ? undefined : value;
}

/** The explicitly supplied x-api-key takes precedence, even when invalid.
 * @param {any} req @returns {string|undefined}
 */
export function httpClientKey(req) {
  if (Object.hasOwn(req.headers ?? {}, 'x-api-key')) {
    return singleHeader(req, 'x-api-key');
  }
  return bearerToken(singleHeader(req, 'authorization'));
}

/** The value Node will forward can belong to the gateway even if duplicate
 * input fields made it unusable for authentication.
 * @param {any} req @returns {string|undefined}
 */
export function forwardedBearerToken(req) {
  return bearerToken(req.headers?.authorization);
}
