// Vercel AI SDK tools that expose the signer's capabilities to the agent.
// The private key never leaves this process — the agent only receives
// a public key string or a signed transaction blob.
import { tool, zodSchema } from "ai";
import { decodeTransaction } from "near-api-js";
import type { Signer } from "near-api-js";
import z from "zod";

/**
 * Creates two tools the agent needs to complete the sign → send flow:
 *  - `get_public_key`    → returns the signer's public key string
 *  - `sign_transaction`  → signs a base64 borsh Transaction, returns a base64 borsh SignedTransaction
 */
export function createSignerTools(signer: Signer) {
    return {
        get_public_key: tool({
            description:
                "Returns the public key of the account that will sign transactions. " +
                "Call this when you need the signerPublicKey to build a transaction.",
            inputSchema: zodSchema(z.object({})),
            execute: async () => {
                const pk = await signer.getPublicKey();
                return { publicKey: pk.toString() };
            },
        }),

        sign_transaction: tool({
            description:
                "Signs an unsigned NEAR transaction. " +
                "Pass the base64 borsh-encoded Transaction returned by one of the tx-building tools. " +
                "Returns a base64 borsh-encoded SignedTransaction ready to be broadcast.",
            inputSchema: zodSchema(z.object({
                unsignedTxBase64: z.string().describe("Base64 borsh-encoded unsigned Transaction"),
            })),
            execute: async ({ unsignedTxBase64 }) => {
                const bytes = Buffer.from(unsignedTxBase64, "base64");
                const tx = decodeTransaction(new Uint8Array(bytes));
                // borsh deserialization produces a plain object for publicKey, not a
                // PublicKey class instance — its toString() returns "[object Object]",
                // which breaks the key-match check inside signTransaction. Restore it.
                tx.publicKey = await signer.getPublicKey();
                const { signedTransaction } = await signer.signTransaction(tx);
                const signedBytes = signedTransaction.encode();
                return { signedTxBase64: Buffer.from(signedBytes).toString("base64") };
            },
        }),
    };
}

export type SignerToolSet = ReturnType<typeof createSignerTools>;
