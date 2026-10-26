import {
  connectorCapabilities,
  type Connector,
  type ConnectorCapabilities,
  type ConnectorExecutionContext,
  type ConnectorRequest,
  type ConnectorResponse,
} from "@parmana/connector-sdk";
import {
  KiteLiveClient,
  PaperKiteClient,
  ZERODHA_PLACE_ORDER_CAPABILITY,
  isKiteCredentials,
  type KiteExchange,
  type KiteOrderType,
  type KiteProduct,
  type KiteTransactionType,
  type KiteVariety,
  type PaperOrderRequest,
} from "@parmana/connector-zerodha";

/**
 * Records that a person has reviewed the SEBI retail algo circular and that
 * Zerodha has approved this app's API use. Live mode will not start without
 * all three fields. Nothing in this repository supplies them, so live mode
 * stays off until they are recorded by the operator.
 */
export interface ZerodhaLiveApproval {
  /** Where the compliance review of the SEBI circular is recorded. */
  readonly sebiCircularReviewRef: string;

  /** Where Zerodha's written API approval for this app is recorded. */
  readonly kiteApiApprovalRef: string;

  /** Who signed off the approvals above. */
  readonly approvedBy: string;
}

export type GatewayZerodhaAdapterOptions =
  | {
      readonly connectorId: string;
      readonly mode: "paper";
    }
  | {
      readonly connectorId: string;
      readonly mode: "live";
      readonly approval: ZerodhaLiveApproval;

      /** Injected for tests. Defaults to the global fetch. */
      readonly fetchImpl?: typeof fetch;
    };

/**
 * Throws unless every approval field is recorded. Called before any live
 * client is created, so a missing approval refuses construction rather than
 * the first order.
 */
export function requireZerodhaLiveApproval(
  connectorId: string,
  approval: ZerodhaLiveApproval | undefined,
): ZerodhaLiveApproval {
  if (approval === undefined) {
    throw new Error(
      `ZerodhaConnector "${connectorId}" live mode needs an approval record. Live trading stays off until the SEBI circular review and Zerodha's API approval are recorded.`,
    );
  }
  const fields = [
    "sebiCircularReviewRef",
    "kiteApiApprovalRef",
    "approvedBy",
  ] as const;
  for (const field of fields) {
    const value: unknown = approval[field];
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(
        `ZerodhaConnector "${connectorId}" live mode needs "${field}" recorded in the approval.`,
      );
    }
  }
  return approval;
}

function requireString(
  parameters: Record<string, unknown>,
  key: string,
): string {
  const value = parameters[key];
  if (typeof value !== "string") {
    throw new Error(`Zerodha order parameter "${key}" must be a string.`);
  }
  return value;
}

function optionalNumber(
  parameters: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = parameters[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number") {
    throw new Error(`Zerodha order parameter "${key}" must be a number.`);
  }
  return value;
}

/**
 * Maps a Parmana ConnectorRequest's parameters to a Kite order. Types are
 * checked here; values (exchange, order type, quantity, required prices) are
 * checked by the shared order validator before anything is sent or recorded.
 */
function toOrderRequest(
  parameters: Readonly<Record<string, unknown>>,
): PaperOrderRequest {
  const mutable = { ...parameters };
  const variety = mutable.variety;
  if (variety !== undefined && variety !== "regular") {
    throw new Error('Zerodha order parameter "variety" must be "regular".');
  }
  const quantity = optionalNumber(mutable, "quantity");
  if (quantity === undefined) {
    throw new Error('Zerodha order parameter "quantity" is required.');
  }
  const price = optionalNumber(mutable, "price");
  const triggerPrice = optionalNumber(mutable, "triggerPrice");
  return {
    tradingsymbol: requireString(mutable, "tradingsymbol"),
    exchange: requireString(mutable, "exchange") as KiteExchange,
    transactionType: requireString(
      mutable,
      "transactionType",
    ) as KiteTransactionType,
    quantity,
    orderType: requireString(mutable, "orderType") as KiteOrderType,
    product: requireString(mutable, "product") as KiteProduct,
    ...(variety === undefined ? {} : { variety: variety as KiteVariety }),
    ...(price === undefined ? {} : { price }),
    ...(triggerPrice === undefined ? {} : { triggerPrice }),
  };
}

/**
 * Zerodha Kite connector. Paper mode records simulated orders with no network
 * calls. Live mode sends the order to Kite, but only when an approval record
 * was supplied at construction.
 *
 * The execution context's credential is read only in live mode. Paper mode
 * needs no credential.
 */
export class GatewayZerodhaAdapter implements Connector {
  readonly connectorId: string;
  readonly capabilities: ConnectorCapabilities;
  private readonly paper = new PaperKiteClient();
  private readonly live: KiteLiveClient | undefined;

  constructor(options: GatewayZerodhaAdapterOptions) {
    this.connectorId = options.connectorId;
    this.capabilities = connectorCapabilities([ZERODHA_PLACE_ORDER_CAPABILITY]);

    if (options.mode === "live") {
      requireZerodhaLiveApproval(options.connectorId, options.approval);
      this.live = new KiteLiveClient(
        options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl },
      );
    } else {
      this.live = undefined;
    }

    Object.freeze(this);
  }

  async execute(
    request: ConnectorRequest,
    context: ConnectorExecutionContext,
  ): Promise<ConnectorResponse> {
    if (!this.capabilities.includes(request.capability)) {
      throw new Error(
        `ZerodhaConnector "${this.connectorId}" does not declare capability "${request.capability}".`,
      );
    }
    if (request.capability !== ZERODHA_PLACE_ORDER_CAPABILITY) {
      throw new Error(
        `ZerodhaConnector "${this.connectorId}" has no handler for capability "${request.capability}".`,
      );
    }

    const order = toOrderRequest(request.parameters);

    if (this.live !== undefined) {
      const credentials = context.credential.value;
      if (!isKiteCredentials(credentials)) {
        throw new Error(
          `ZerodhaConnector "${this.connectorId}" received a credential that is not a resolved Kite api key and access token.`,
        );
      }
      const result = await this.live.placeOrder(order, credentials);
      return {
        success: true,
        metadata: { mode: "live", orderId: result.orderId },
      };
    }

    const record = this.paper.placeOrder(order);
    return {
      success: true,
      metadata: {
        mode: "paper",
        orderId: record.orderId,
        status: record.status,
      },
    };
  }
}

/**
 * Creates the Zerodha connector for the gateway. Paper mode is refused in
 * production, so simulated orders can never be accepted there. Live mode
 * needs the approval record, checked in the constructor. Connector
 * registration is a separate step and is not done here.
 */
export function createGatewayZerodhaConnector(
  options: GatewayZerodhaAdapterOptions,
): Connector {
  if (options.mode === "paper" && process.env.NODE_ENV === "production") {
    throw new Error(
      `ZerodhaConnector "${options.connectorId}" is paper-only and is not allowed in production.`,
    );
  }
  return new GatewayZerodhaAdapter(options);
}
