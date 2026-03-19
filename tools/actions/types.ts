export interface CreateAccount {
  type: "CreateAccount";
}

export interface DeployContract {
  type: "DeployContract";
  params: { code: Uint8Array };
}

export interface FunctionCall {
  type: "FunctionCall";
  params: {
    methodName: string;
    args: object;
    gas: string;
    deposit: string;
  };
}

export interface Transfer {
  type: "Transfer";
  params: { deposit: string };
}

export interface AddKey {
  type: "AddKey";
  params: {
    publicKey: string;
    accessKey: {
      nonce?: number;
      permission:
        | "FullAccess"
        | {
            receiverId: string;
            allowance?: string;
            methodNames?: Array<string>;
          };
    };
  };
}

export interface DeleteKey {
  type: "DeleteKey";
  params: { publicKey: string };
}

export interface DeleteAccount {
  type: "DeleteAccount";
  params: { beneficiaryId: string };
}

export interface UseGlobalContract {
  type: "UseGlobalContract";
  params: {
    contractIdentifier:
      | { accountId: string }
      | {
          /** Base58 encoded code hash */
          codeHash: string;
        };
  };
}

export interface DeployGlobalContract {
  type: "DeployGlobalContract";
  params: { code: Uint8Array; deployMode: "CodeHash" | "AccountId" };
}

export type ToolAction =
  | CreateAccount
  | DeployContract
  | FunctionCall
  | Transfer
  | AddKey
  | DeleteKey
  | DeleteAccount
  | UseGlobalContract
  | DeployGlobalContract;