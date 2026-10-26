/**
 * @parmana/connector-zerodha
 *
 * Passive first slice of the Zerodha Kite Connect connector: capability
 * identifiers, metadata, and pure session helpers. It places no orders
 * and makes no network calls. The executable path is a later milestone.
 */

export {
  ZERODHA_PLACE_ORDER_CAPABILITY,
  KITE_API_BASE_URL,
  KITE_LOGIN_URL,
  KITE_API_VERSION,
} from "./ZerodhaCapabilities.js";

export { ZerodhaMetadata } from "./ZerodhaMetadata.js";

export {
  kiteLoginUrl,
  kiteChecksum,
  kiteAuthorizationHeader,
} from "./KiteSession.js";

export {
  PaperKiteClient,
  PaperOrderValidationError,
} from "./PaperKiteClient.js";
export type {
  PaperOrderRequest,
  PaperOrderRecord,
  KiteExchange,
  KiteTransactionType,
  KiteOrderType,
  KiteProduct,
  KiteVariety,
} from "./PaperKiteClient.js";
