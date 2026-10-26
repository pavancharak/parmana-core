/**
 * Paper-mode Kite Connect client. Accepts the same order shape the Kite v3
 * `POST /orders/:variety` call takes, validates it, and records it in memory
 * with a simulated order id. It makes no network calls and sends nothing to
 * a broker, so it can exercise the flow without real orders.
 */

export type KiteExchange = "NSE" | "BSE" | "NFO" | "CDS" | "MCX";
export type KiteTransactionType = "BUY" | "SELL";
export type KiteOrderType = "MARKET" | "LIMIT" | "SL" | "SL-M";
export type KiteProduct = "CNC" | "MIS" | "NRML";
export type KiteVariety = "regular";

export interface PaperOrderRequest {
  readonly tradingsymbol: string;
  readonly exchange: KiteExchange;
  readonly transactionType: KiteTransactionType;
  readonly quantity: number;
  readonly orderType: KiteOrderType;
  readonly product: KiteProduct;
  readonly variety?: KiteVariety;
  readonly price?: number;
  readonly triggerPrice?: number;
}

export interface PaperOrderRecord {
  readonly orderId: string;
  readonly status: "PAPER_ACCEPTED";
  readonly request: PaperOrderRequest;
}

const EXCHANGES: readonly KiteExchange[] = ["NSE", "BSE", "NFO", "CDS", "MCX"];
const ORDER_TYPES: readonly KiteOrderType[] = ["MARKET", "LIMIT", "SL", "SL-M"];
const PRODUCTS: readonly KiteProduct[] = ["CNC", "MIS", "NRML"];

/** Thrown when a paper order fails validation. Carries the field that failed. */
export class PaperOrderValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = "PaperOrderValidationError";
    this.field = field;
  }
}

function validate(request: PaperOrderRequest): void {
  if (request.tradingsymbol.trim() === "") {
    throw new PaperOrderValidationError("tradingsymbol", "must be non-empty");
  }
  if (!EXCHANGES.includes(request.exchange)) {
    throw new PaperOrderValidationError(
      "exchange",
      "is not a supported exchange",
    );
  }
  if (request.transactionType !== "BUY" && request.transactionType !== "SELL") {
    throw new PaperOrderValidationError(
      "transactionType",
      "must be BUY or SELL",
    );
  }
  if (!Number.isInteger(request.quantity) || request.quantity <= 0) {
    throw new PaperOrderValidationError(
      "quantity",
      "must be a positive integer",
    );
  }
  if (!ORDER_TYPES.includes(request.orderType)) {
    throw new PaperOrderValidationError(
      "orderType",
      "is not a supported order type",
    );
  }
  if (!PRODUCTS.includes(request.product)) {
    throw new PaperOrderValidationError(
      "product",
      "is not a supported product",
    );
  }
  if (request.variety !== undefined && request.variety !== "regular") {
    throw new PaperOrderValidationError("variety", "must be regular");
  }
  if (request.orderType === "LIMIT" || request.orderType === "SL") {
    if (request.price === undefined || !(request.price > 0)) {
      throw new PaperOrderValidationError(
        "price",
        "is required and must be positive",
      );
    }
  }
  if (request.orderType === "SL" || request.orderType === "SL-M") {
    if (request.triggerPrice === undefined || !(request.triggerPrice > 0)) {
      throw new PaperOrderValidationError(
        "triggerPrice",
        "is required and must be positive",
      );
    }
  }
}

export class PaperKiteClient {
  readonly #orders: PaperOrderRecord[] = [];
  #sequence = 0;

  /** Validates the request and records it. Returns the simulated record. */
  placeOrder(request: PaperOrderRequest): PaperOrderRecord {
    validate(request);
    this.#sequence += 1;
    const record: PaperOrderRecord = Object.freeze({
      orderId: `PAPER-${String(this.#sequence).padStart(6, "0")}`,
      status: "PAPER_ACCEPTED",
      request: Object.freeze({ ...request }),
    });
    this.#orders.push(record);
    return record;
  }

  /** Every paper order placed on this client, oldest first. */
  orders(): readonly PaperOrderRecord[] {
    return [...this.#orders];
  }
}
