"use strict";
/**
 * Parmana TypeScript SDK
 *
 * Example 01
 *
 * Basic Execution
 */
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
var __generator =
  (this && this.__generator) ||
  function (thisArg, body) {
    var _ = {
        label: 0,
        sent: function () {
          if (t[0] & 1) throw t[1];
          return t[1];
        },
        trys: [],
        ops: [],
      },
      f,
      y,
      t,
      g = Object.create(
        (typeof Iterator === "function" ? Iterator : Object).prototype,
      );
    return (
      (g.next = verb(0)),
      (g["throw"] = verb(1)),
      (g["return"] = verb(2)),
      typeof Symbol === "function" &&
        (g[Symbol.iterator] = function () {
          return this;
        }),
      g
    );
    function verb(n) {
      return function (v) {
        return step([n, v]);
      };
    }
    function step(op) {
      if (f) throw new TypeError("Generator is already executing.");
      while ((g && ((g = 0), op[0] && (_ = 0)), _))
        try {
          if (
            ((f = 1),
            y &&
              (t =
                op[0] & 2
                  ? y["return"]
                  : op[0]
                    ? y["throw"] || ((t = y["return"]) && t.call(y), 0)
                    : y.next) &&
              !(t = t.call(y, op[1])).done)
          )
            return t;
          if (((y = 0), t)) op = [op[0] & 2, t.value];
          switch (op[0]) {
            case 0:
            case 1:
              t = op;
              break;
            case 4:
              _.label++;
              return { value: op[1], done: false };
            case 5:
              _.label++;
              y = op[1];
              op = [0];
              continue;
            case 7:
              op = _.ops.pop();
              _.trys.pop();
              continue;
            default:
              if (
                !((t = _.trys), (t = t.length > 0 && t[t.length - 1])) &&
                (op[0] === 6 || op[0] === 2)
              ) {
                _ = 0;
                continue;
              }
              if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
                _.label = op[1];
                break;
              }
              if (op[0] === 6 && _.label < t[1]) {
                _.label = t[1];
                t = op;
                break;
              }
              if (t && _.label < t[2]) {
                _.label = t[2];
                _.ops.push(op);
                break;
              }
              if (t[2]) _.ops.pop();
              _.trys.pop();
              continue;
          }
          op = body.call(thisArg, _);
        } catch (e) {
          op = [6, e];
          y = 0;
        } finally {
          f = t = 0;
        }
      if (op[0] & 5) throw op[1];
      return { value: op[0] ? op[1] : void 0, done: true };
    }
  };
Object.defineProperty(exports, "__esModule", { value: true });
var index_js_1 = require("../src/index.js");
function main() {
  return __awaiter(this, void 0, void 0, function () {
    var client,
      authority,
      authorization,
      intent,
      policy,
      transaction,
      receipt,
      error_1;
    return __generator(this, function (_a) {
      switch (_a.label) {
        case 0:
          client = new index_js_1.ParmanaClient({
            endpoint: "http://localhost:8080",
          });
          authority = {
            authorityId: "authority-001",
            authorityName: "Acme Corporation",
            createdAt: new Date(),
          };
          authorization = {
            authorizationId: "authorization-001",
            authorityId: authority.authorityId,
            subject: "warehouse-robot-01",
            permissions: ["MOVE_PALLET"],
            issuedAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          };
          intent = {
            intentId: "intent-001",
            authorizationId: authorization.authorizationId,
            operation: "MOVE_PALLET",
            target: "Loading Bay 3",
            createdAt: new Date(),
          };
          policy = {
            policyName: "warehouse-policy",
            policyVersion: "1.0.0",
          };
          transaction = {
            businessTransactionId: "txn-001",
            authority: authority,
            authorization: authorization,
            intent: intent,
            policy: policy,
            createdAt: new Date(),
          };
          console.log();
          console.log("======================================");
          console.log(" Parmana TypeScript SDK");
          console.log(" Example 01 - Basic Execution");
          console.log("======================================");
          console.log();
          console.log("Business Transaction");
          console.log("--------------------");
          console.log("Transaction:", transaction.businessTransactionId);
          console.log("Authority :", authority.authorityName);
          console.log("Intent    :", intent.operation);
          console.log(
            "Policy    :",
            ""
              .concat(policy.policyName, " (")
              .concat(policy.policyVersion, ")"),
          );
          console.log();
          _a.label = 1;
        case 1:
          _a.trys.push([1, 3, , 4]);
          return [4 /*yield*/, client.execute(transaction)];
        case 2:
          receipt = _a.sent();
          console.log("Execution Receipt");
          console.log("-----------------");
          console.log("Receipt ID :", receipt.receiptId);
          console.log("Algorithm  :", receipt.algorithm);
          console.log("Issued At  :", receipt.issuedAt);
          return [3 /*break*/, 4];
        case 3:
          error_1 = _a.sent();
          console.log();
          console.error(
            "Runtime not available (expected during SDK development).",
          );
          if (error_1 instanceof Error) {
            console.error(error_1.message);
          }
          return [3 /*break*/, 4];
        case 4:
          console.log();
          console.log("Example completed.");
          return [2 /*return*/];
      }
    });
  });
}
main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
