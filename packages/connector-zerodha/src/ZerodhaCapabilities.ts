/**
 * Zerodha Kite Connect capability identifier. Declared here, with no
 * execution logic. The only capability in this slice is order placement
 * on the Kite Connect v3 API, and no execution path implements it yet.
 */
export const ZERODHA_PLACE_ORDER_CAPABILITY = "zerodha:place-order";

/** Kite Connect v3 base URL. Used only to build request URLs, never called here. */
export const KITE_API_BASE_URL = "https://api.kite.trade";

/** Kite login page. Built into a URL for the user to open, never fetched. */
export const KITE_LOGIN_URL = "https://kite.zerodha.com/connect/login";

/** Kite Connect API version sent in the X-Kite-Version header. */
export const KITE_API_VERSION = "3";
