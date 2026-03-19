import { Action, PublicKey, actions } from "near-api-js";
import { ToolAction } from "./types.js";
export { ToolAction } from "./types.js";

export function toolActionToNAJAction(action: ToolAction): Action {
    switch (action.type) {
        case "CreateAccount":
            return actions.createAccount();
        case "DeployContract":
            return actions.deployContract(action.params.code);
        case "FunctionCall":
            return actions.functionCall(
                action.params.methodName,
                action.params.args,
                BigInt(action.params.gas),
                BigInt(action.params.deposit)
            );
        case "Transfer":
            return actions.transfer(BigInt(action.params.deposit));
        case "AddKey":
            if (action.params.accessKey.permission === "FullAccess") {
                return actions.addFullAccessKey(PublicKey.from(action.params.publicKey));
            }
            return actions.addFunctionCallAccessKey(
                PublicKey.from(action.params.publicKey),
                action.params.accessKey.permission.receiverId,
                action.params.accessKey.permission.methodNames ?? [],
                action.params.accessKey.permission.allowance
                    ? BigInt(action.params.accessKey.permission.allowance)
                    : undefined
            );
        case "DeleteKey":
            return actions.deleteKey(PublicKey.from(action.params.publicKey));
        case "DeleteAccount":
            return actions.deleteAccount(action.params.beneficiaryId);
        case "UseGlobalContract":
            return actions.useGlobalContract(action.params.contractIdentifier);
        case "DeployGlobalContract":
            return actions.deployGlobalContract(
                action.params.code,
                action.params.deployMode === "CodeHash" ? "codeHash" : "accountId"
            );
        default:
            throw new Error(`Unsupported action type: ${(action as { type: string }).type}`);
    }
}