// Vercel AI SDK tool wrappers for NEAR Protocol
// createNearTools() returns a ToolSet that works directly with streamText(), generateText(), etc.
import { tool, zodSchema } from "ai";
import { decodeSignedTransaction } from "near-api-js";
import { KeyPairString } from "near-api-js";
import z from "zod";

import {
    NetworkId,
    callReadOnlyFunction,
    decimalToUnit,
    encodeTxToBase64,
    getBalance,
    getTokenAddresses,
    getTransactionStatus,
    callFunctionTx,
    sendTransaction,
    transferNearTx,
    transferTokenTx,
    unitToDecimal,
} from "./index.js";

export interface NearToolsOptions {
    /** Network used when the agent doesn't specify one. */
    defaultNetwork: NetworkId;
}

/**
 * Returns a Vercel AI SDK ToolSet pre-wired to a NEAR account.
 * Spread the result directly into the `tools` option of streamText / generateText.
 *
 * Tx-building tools return a base64 borsh-encoded unsigned Transaction.
 * Pass that to your signer tool, then feed the base64 SignedTransaction into send_transaction.
 */
export function createNearTools({ defaultNetwork }: NearToolsOptions) {
    const network = z.enum(['mainnet', 'testnet']).default(defaultNetwork)
        .describe(`NEAR network. Defaults to "${defaultNetwork}".`);

    return {
        /** Get the NEAR or fungible-token balance of any account. */
        get_balance: tool({
            description:
                'Get the balance of a NEAR account in raw indivisible units (yoctoNEAR for NEAR, smallest unit for FTs). Use unit_to_decimal to convert to a human-readable amount.',
            inputSchema: zodSchema(z.object({
                accountId: z.string().describe('NEAR account ID, e.g. "alice.near"'),
                token: z.string().default('near').describe('Token to check: "near", a symbol ("USDC"), or a contract ID'),
                network,
            })),
            execute: async ({ accountId, token, network: networkId }) => {
                const resolvedToken = token === 'near' ? 'near' : (getTokenAddresses(networkId)[token.toUpperCase()] ?? token);
                const balance = await getBalance(networkId, accountId, resolvedToken);
                return { balance, unit: resolvedToken === 'near' ? 'yoctoNEAR' : 'raw token units', contractId: resolvedToken === 'near' ? undefined : resolvedToken };
            },
        }),

        /** Convert raw indivisible token units to a human-readable decimal string. */
        unit_to_decimal: tool({
            description:
                'Convert raw indivisible token units to a human-readable decimal string. Pass token="near" for native NEAR or a token symbol / contract ID for fungible tokens.',
            inputSchema: zodSchema(z.object({
                amount: z.string().describe('Raw amount in indivisible units, e.g. "1000000000000000000000000"'),
                token: z.string().default('near').describe('Token: "near", a symbol ("USDC"), or a contract ID'),
                network,
            })),
            execute: async ({ amount, token, network: networkId }) => {
                const resolvedToken = token === 'near' ? 'near' : (getTokenAddresses(networkId)[token.toUpperCase()] ?? token);
                const decimal = await unitToDecimal(networkId, amount, resolvedToken);
                return { decimal, token };
            },
        }),

        /** Convert a human-readable decimal amount to raw indivisible token units. */
        decimal_to_unit: tool({
            description:
                'Convert a human-readable decimal token amount to raw indivisible units (as a string). Pass token="near" for native NEAR or a token symbol / contract ID for fungible tokens.',
            inputSchema: zodSchema(z.object({
                amount: z.string().describe('Human-readable decimal amount, e.g. "1.5"'),
                token: z.string().default('near').describe('Token: "near", a symbol ("USDC"), or a contract ID'),
                network,
            })),
            execute: async ({ amount, token, network: networkId }) => {
                const resolvedToken = token === 'near' ? 'near' : (getTokenAddresses(networkId)[token.toUpperCase()] ?? token);
                const units = await decimalToUnit(networkId, amount, resolvedToken);
                return { units: units.toString(), token };
            },
        }),

        /** Look up known fungible token contract addresses. */
        get_token_addresses: tool({
            description: 'Returns the contract IDs of well-known tokens (USDC, USDT, DAI) on the given network.',
            inputSchema: zodSchema(z.object({ network })),
            execute: async ({ network: networkId }) => getTokenAddresses(networkId),
        }),

        /** Call a view (read-only) function on any contract. */
        call_view_function: tool({
            description: 'Call a read-only (view) function on a NEAR smart contract and return the result.',
            inputSchema: zodSchema(z.object({
                contractId: z.string().describe('Contract account ID'),
                methodName: z.string().describe('View method to call'),
                args: z.record(z.string(), z.unknown()).default({}).describe('Arguments to pass to the method'),
                network,
            })),
            execute: async ({ contractId, methodName, args, network: networkId }) =>
                callReadOnlyFunction(networkId, contractId, methodName, args),
        }),

        /** Check the outcome of a previously submitted transaction. */
        get_transaction_status: tool({
            description: 'Get the execution status and outcome of a NEAR transaction by its hash.',
            inputSchema: zodSchema(z.object({
                txHash: z.string().describe('Transaction hash returned by send_transaction'),
                signerId: z.string().describe('Account ID of the transaction signer'),
                network,
            })),
            execute: async ({ txHash, signerId: sid, network: networkId }) =>
                getTransactionStatus(networkId, txHash, sid),
        }),

        /** Build an unsigned transaction that transfers NEAR. Returns base64 borsh. */
        transfer_near: tool({
            description:
                'Build an unsigned NEAR transfer transaction. Returns a base64-encoded borsh Transaction that must be signed before broadcasting.',
            inputSchema: zodSchema(z.object({
                signerId: z.string().describe('Account ID of the sender'),
                signerPublicKey: z.string().describe('Full-access public key of the sender, e.g. "ed25519:…"'),
                receiverId: z.string().describe('Recipient account ID'),
                amountNear: z.string().describe('Amount in NEAR to send, e.g. "1.5"'),
                network,
            })),
            execute: async ({ signerId, signerPublicKey, receiverId, amountNear, network: networkId }) => {
                const tx = await transferNearTx(networkId, signerId, receiverId, amountNear, signerPublicKey as KeyPairString);
                return { unsignedTxBase64: encodeTxToBase64(tx) };
            },
        }),

        /** Build an unsigned transaction that transfers a fungible token. Returns base64 borsh. */
        transfer_token: tool({
            description:
                'Build an unsigned fungible-token transfer transaction. Pass a token symbol ("USDC") or a contract ID. Returns a base64-encoded borsh Transaction that must be signed before broadcasting.',
            inputSchema: zodSchema(z.object({
                signerId: z.string().describe('Account ID of the sender'),
                signerPublicKey: z.string().describe('Full-access public key of the sender, e.g. "ed25519:…"'),
                receiverId: z.string().describe('Recipient account ID'),
                amount: z.string().describe('Human-readable amount, e.g. "10.5"'),
                token: z.string().describe('Token symbol ("USDC") or contract ID'),
                network,
            })),
            execute: async ({ signerId, signerPublicKey, receiverId, amount, token, network: networkId }) => {
                const contractId = getTokenAddresses(networkId)[token.toUpperCase()] ?? token;
                const tx = await transferTokenTx(networkId, signerId, receiverId, amount, contractId, signerPublicKey as KeyPairString);
                return { unsignedTxBase64: encodeTxToBase64(tx), contractId };
            },
        }),

        /** Build an unsigned transaction that calls a contract method. Returns base64 borsh. */
        call_function: tool({
            description:
                'Build an unsigned transaction that calls a change method on a NEAR contract. Returns a base64-encoded borsh Transaction that must be signed before broadcasting.',
            inputSchema: zodSchema(z.object({
                signerId: z.string().describe('Account ID of the caller'),
                signerPublicKey: z.string().describe('Full-access public key of the caller, e.g. "ed25519:…"'),
                contractId: z.string().describe('Contract account ID'),
                methodName: z.string().describe('Change method to call'),
                args: z.record(z.string(), z.unknown()).default({}).describe('Arguments to pass to the method'),
                depositNear: z.string().default('0').describe('NEAR to attach as deposit, e.g. "0.1"'),
                teraGas: z.number().int().min(1).max(300).default(30).describe('Gas in TGas (1–300)'),
                network,
            })),
            execute: async ({ signerId, signerPublicKey, contractId, methodName, args, depositNear, teraGas, network: networkId }) => {
                const tx = await callFunctionTx(
                    networkId, signerId, contractId, methodName, args,
                    teraGas, `${depositNear} NEAR` as `${number} NEAR`, signerPublicKey as KeyPairString,
                );
                return { unsignedTxBase64: encodeTxToBase64(tx) };
            },
        }),

        /** Broadcast a signed transaction and return the transaction hash. */
        send_transaction: tool({
            description:
                'Broadcast a signed NEAR transaction. Pass the base64 borsh SignedTransaction produced by the signing tool. Returns the transaction hash.',
            inputSchema: zodSchema(z.object({
                signedTxBase64: z.string().describe('Base64 borsh-encoded SignedTransaction'),
                network,
            })),
            execute: async ({ signedTxBase64, network: networkId }) => {
                const bytes = Buffer.from(signedTxBase64, 'base64');
                const signedTx = decodeSignedTransaction(new Uint8Array(bytes));
                const hash = await sendTransaction(networkId, signedTx);
                return { txHash: hash, explorerUrl: `https://${networkId === 'testnet' ? 'testnet.' : ''}nearblocks.io/txns/${hash}` };
            },
        }),
    };
}

export type NearToolSet = ReturnType<typeof createNearTools>;
