// tools to interact with NEAR Protocol
import { Account, actions, JsonRpcProvider, KeyPairString, nearToYocto, Provider, SignedTransaction, teraToGas, yoctoToNear } from "near-api-js";
import { FungibleToken, NEAR } from "near-api-js/tokens";
import { ToolAction } from "./actions/types.js";
import { toolActionToNAJAction } from "./actions/index.js";

export type NetworkId = 'mainnet' | 'testnet';
type DepositUnit = `${number} NEAR` | `${number} yocto`;

export function getProvider(networkId: NetworkId): Provider {
    const rpcUrl = networkId === 'mainnet' ? 'https://free.rpc.fastnear.com' : 'https://test.rpc.fastnear.com';
    return new JsonRpcProvider({ url: rpcUrl });
}

export async function getBalance(networkId: NetworkId, accountId: string, token: 'near' | string = 'near'): Promise<string> {
    const provider = getProvider(networkId);
    if (token === 'near') {
        const yocto = await new Account(accountId, provider).getBalance();
        return yocto.toString();
    }
    // FT balance — returns raw indivisible units as string
    const raw = await provider.callFunction<string>({
        contractId: token,
        method: 'ft_balance_of',
        args: { account_id: accountId },
    });
    return raw ?? '0';
}

/** Convert raw indivisible units to a human-readable decimal string.
 *  For NEAR pass token = 'near'; for fungible tokens pass the contract accountId. */
export async function unitToDecimal(networkId: NetworkId, amount: bigint | string | number, token: 'near' | string = 'near'): Promise<string> {
    if (token === 'near') {
        return NEAR.toDecimal(amount);
    }
    const metadata = await callReadOnlyFunction(networkId, token, 'ft_metadata', {});
    const ft = new FungibleToken(token, metadata as any);
    return ft.toDecimal(amount);
}

/** Convert a human-readable decimal amount to raw indivisible units (bigint).
 *  For NEAR pass token = 'near'; for fungible tokens pass the contract accountId. */
export async function decimalToUnit(networkId: NetworkId, amount: string | number, token: 'near' | string = 'near'): Promise<bigint> {
    if (token === 'near') {
        return NEAR.toUnits(amount);
    }
    const metadata = await callReadOnlyFunction(networkId, token, 'ft_metadata', {});
    const ft = new FungibleToken(token, metadata as any);
    return ft.toUnits(amount);
}

export async function createTx(networkId: NetworkId, signerId: string, receiverId: string, toolActions: ToolAction[], signerPublicKey: KeyPairString) {
    const provider = getProvider(networkId);
    const najActions = toolActions.map(a => toolActionToNAJAction(a));
    return new Account(signerId, provider).createTransaction({
        receiverId,
        actions: najActions,
        publicKey: signerPublicKey,
    });
}

export async function transferNearTx(networkId: NetworkId, signerId: string, receiverId: string, amountNear: string, signerPublicKey: KeyPairString) {
    const provider = getProvider(networkId);
    return new Account(signerId, provider).createTransaction({
        receiverId,
        actions: [actions.transfer(nearToYocto(amountNear as `${number}`))],
        publicKey: signerPublicKey,
    });
}

export async function transferTokenTx(networkId: NetworkId, signerId: string, receiverId: string, amount: string, tokenContractId: string, signerPublicKey: KeyPairString) {
    const provider = getProvider(networkId);
    const metadata = await callReadOnlyFunction(networkId, tokenContractId, "ft_metadata", {});
    const token = new FungibleToken(tokenContractId, metadata as any);
    const amountUnits = token.toUnits(amount);
    return new Account(signerId, provider).createTransaction({
        receiverId: tokenContractId,
        actions: [
            actions.functionCall("ft_register", { account_id: receiverId }, teraToGas(30), 1250000000000000000000n),
            actions.functionCall("ft_transfer", { receiver_id: receiverId, amount: amountUnits.toString() }, teraToGas(30), 1n),
        ],
        publicKey: signerPublicKey,
    });
}

export async function callFunctionTx(networkId: NetworkId, signerId: string, contractId: string, methodName: string, args: Record<string, unknown>, teraGas: number, deposit: DepositUnit, signerPublicKey: KeyPairString) {
    const provider = getProvider(networkId);
    const depositYocto = deposit.endsWith(" NEAR")
        ? nearToYocto(deposit.split(" ")[0] as `${number}`)
        : BigInt(deposit.split(" ")[0]);

    return new Account(signerId, provider).createTransaction({
        receiverId: contractId,
        actions: [
            actions.functionCall(methodName, args, teraToGas(teraGas), depositYocto),
        ],
        publicKey: signerPublicKey,
    });
}

export async function callReadOnlyFunction(networkId: NetworkId, contractId: string, methodName: string, args: Record<string, unknown>) {
    const provider = getProvider(networkId);
    return await provider.callFunction({ contractId, method: methodName, args });
}

export async function sendTransaction(networkId: NetworkId, signedTransaction: SignedTransaction): Promise<string> {
    const provider = getProvider(networkId);
    const txResponse = await provider.sendTransaction(signedTransaction);
    return txResponse.transaction.hash;
}

export async function getTransactionStatus(networkId: NetworkId, txHash: string, accountId: string): Promise<unknown> {
    const provider = getProvider(networkId);
    return await provider.viewTransactionStatus({ txHash, accountId });
}

export function getTokenAddresses(networkId: NetworkId): Record<string, string> {
    if (networkId === 'mainnet') {
        return {
            'USDC': '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
            'USDT': 'usdt.tether-token.near',
            'DAI': '6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near',
        };
    }
    return {
        'USDC': '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af',
        'USDT': 'usdt.fakes.testnet',
        'DAI': 'dai.fakes.testnet',
    };
}

/** Borsh-encode a Transaction to base64 so it can be returned as a JSON tool result */
export function encodeTxToBase64(tx: Awaited<ReturnType<typeof transferNearTx>>): string {
    return Buffer.from(tx.encode()).toString('base64');
}

export { yoctoToNear, nearToYocto, NEAR };