// Vercel AI SDK tools for cross-chain ETH transfers via NEAR MPC (multichain-sig).
// The flow is: derive EVM address → prepare (review) → execute (sign + broadcast).
import { tool, zodSchema } from "ai";
import z from "zod";

import { createEVM, type NearSignerAccount } from "multichain-sig";

const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";

export interface MpcToolsOptions {
    /** NEAR account used to request MPC signatures. */
    nearAccount: NearSignerAccount;
    /** Derivation path that determines the EVM address, e.g. "ethereum-1". */
    derivationPath: string;
    /** NEAR network the MPC contract lives on (default: "testnet"). */
    nearNetworkId?: "mainnet" | "testnet";
    /** Override the MPC contract ID (defaults to the canonical testnet/mainnet contract). */
    mpcContractId?: string;
    /** Override the Sepolia JSON-RPC URL. */
    sepoliaRpcUrl?: string;
}

/**
 * Returns three Vercel AI SDK tools that together handle an ETH transfer on Sepolia
 * via NEAR MPC — no EVM private key ever leaves this process.
 *
 * Intended call order:
 *  1. mpc_derive_eth_address   — show the sender address, public key, and balance
 *  2. mpc_prepare_eth_transfer — show tx details in wei for user review
 *  3. mpc_execute_eth_transfer — sign via MPC and broadcast to Sepolia
 */
export async function createMpcTools({
    nearAccount,
    derivationPath,
    nearNetworkId = "testnet",
    mpcContractId = 'v1.signer-prod.testnet',
    sepoliaRpcUrl = "https://sepolia.drpc.org",
}: MpcToolsOptions) {
    const evm = await createEVM(sepoliaRpcUrl);


    const account = await evm.deriveAccount({
        nearSignerAccount: nearAccount,
        derivationPath,
        nearNetworkId,
        ...(mpcContractId ? { mpcContractId } : {}),
    });

    return {
        /** Step 1 — Derive the EVM address and show the current Sepolia balance. */
        mpc_derive_eth_address: tool({
            description:
                "Derives the EVM address and public key for this NEAR account on Sepolia via MPC. " +
                "Call this first so the user can see the sender address and available balance before any transfer.",
            inputSchema: zodSchema(z.object({})),
            execute: async () => {
                const balanceWei = await account.getBalance();
                return {
                    address: account.address,
                    publicKey: account.publicKey,
                    balanceWei: balanceWei.toString(),
                    balanceEth: evm.weiToEth(balanceWei),
                    network: "Sepolia",
                };
            },
        }),

        /** Step 2 — Compute and display tx details without sending anything. */
        mpc_prepare_eth_transfer: tool({
            description:
                "Prepares an ETH transfer on Sepolia and returns the exact details " +
                "(sender address, receiver address, amount in wei) for the user to review. " +
                "Does NOT sign or broadcast. Always call this before mpc_execute_eth_transfer.",
            inputSchema: zodSchema(z.object({
                to: z.string().describe("Recipient EVM address (0x…)"),
                amountEth: z.string().describe('Amount of ETH to send, e.g. "0.01"'),
            })),
            execute: async ({ to, amountEth }) => {

                const amountWei = evm.ethToWei(amountEth as `${number}`);
                const balanceWei = await account.getBalance();
                return {
                    from: account.address,
                    to,
                    amountEth,
                    amountWei: amountWei.toString(),
                    senderBalanceWei: balanceWei.toString(),
                    senderBalanceEth: evm.weiToEth(balanceWei),
                    network: "Sepolia",
                };
            },
        }),

        /** Step 3 — Sign via NEAR MPC and broadcast the transaction to Sepolia. */
        mpc_execute_eth_transfer: tool({
            description:
                "Signs the ETH transfer via NEAR MPC and broadcasts it to Sepolia. " +
                "Only call this after the user has reviewed the details from mpc_prepare_eth_transfer. " +
                "Pass the exact amountWei from the prepare step to avoid rounding.",
            inputSchema: zodSchema(z.object({
                to: z.string().describe("Recipient EVM address (0x…)"),
                amountWei: z.string().describe("Exact amount in wei (copy from mpc_prepare_eth_transfer)"),
            })),
            execute: async ({ to, amountWei }) => {
                const txHash = await account.transfer(to, BigInt(amountWei));
                return {
                    txHash,
                    explorerUrl: `${SEPOLIA_EXPLORER}/tx/${txHash}`,
                    network: "Sepolia",
                };
            },
        }),
    };
}

export type MpcToolSet = ReturnType<typeof createMpcTools>;
