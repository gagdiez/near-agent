/**
 * Manual test script for the NEAR tools in tools/index.ts
 * Run with: yarn build && node dist/test.js
 *
 * Tests read-only functions against testnet.
 * Transaction-building tests use a known testnet account + a dummy public key
 * (no real private key / signing required for these).
 */

import "dotenv/config";
import { KeyPairSigner } from "near-api-js";
import type { KeyPairString } from "near-api-js";

import {
    getBalance,
    callReadOnlyFunction,
    getTokenAddresses,
    getTransactionStatus,
    encodeTxToBase64,
    transferNearTx,
    transferTokenTx,
    callFunctionTx,
    sendTransaction,
    yoctoToNear,
} from "./tools/index.js";

const NETWORK = "testnet";
const TEST_ACCOUNT = "influencer.testnet";
const USDC_CONTRACT = "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af"; // testnet USDC
const DUMMY_PK = "ed25519:GnsdHdSrhe8v3MMAQi2bnXR59xMDwdkSRAFZ961ydxWZ" as const;

type TestFn = () => Promise<unknown>;
const results: { name: string; ok: boolean; value?: unknown; error?: string }[] = [];

async function run(name: string, fn: TestFn) {
    process.stdout.write(`▶ ${name} … `);
    try {
        const value = await fn();
        console.log("✓");
        console.log("  →", JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
        results.push({ name, ok: true, value });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log("✗");
        console.error("  ✗", msg);
        results.push({ name, ok: false, error: msg });
    }
}

// ── 1. Token address lookup (synchronous helper, wrapped for consistency) ─────
await run("getTokenAddresses (testnet)", async () => getTokenAddresses(NETWORK));
await run("getTokenAddresses (mainnet)", async () => getTokenAddresses("mainnet"));

// ── 2. NEAR balance ─────────────────────────────────────────────────────────
await run("getBalance – native NEAR", async () => {
    // NAJ v7 Account.getBalance() returns a single bigint (total in yocto)
    const yocto = await getBalance(NETWORK, TEST_ACCOUNT) as unknown as bigint;
    return { balance: yoctoToNear(yocto), unit: "NEAR" };
});

// ── 3. Fungible-token balance (USDC on testnet) ──────────────────────────────
await run("getBalance – USDC token", async () => {
    const raw = await getBalance(NETWORK, TEST_ACCOUNT, USDC_CONTRACT);
    return { rawBalance: String(raw), contractId: USDC_CONTRACT };
});

// ── 4. Read-only contract call ───────────────────────────────────────────────
await run("callReadOnlyFunction – ft_metadata on testnet USDC", async () =>
    callReadOnlyFunction(NETWORK, USDC_CONTRACT, "ft_metadata", {})
);

await run("callReadOnlyFunction – ft_balance_of test.near on testnet USDC", async () =>
    callReadOnlyFunction(NETWORK, USDC_CONTRACT, "ft_balance_of", { account_id: TEST_ACCOUNT })
);

// ── 5. Build transactions (no private key required) ──────────────────────────
await run("transferNearTx – build unsigned tx", async () => {
    const tx = await transferNearTx(NETWORK, TEST_ACCOUNT, "bob.near", "0.001", DUMMY_PK);
    return { base64: encodeTxToBase64(tx) };
});

await run("transferTokenTx – build unsigned USDC transfer tx", async () => {
    const tx = await transferTokenTx(NETWORK, TEST_ACCOUNT, "bob.near", "1", USDC_CONTRACT, DUMMY_PK);
    return { base64: encodeTxToBase64(tx) };
});

await run("callFunctionTx – build unsigned function-call tx", async () => {
    const tx = await callFunctionTx(
        NETWORK, TEST_ACCOUNT, USDC_CONTRACT, "ft_balance_of",
        { account_id: TEST_ACCOUNT }, 30, "0 yocto", DUMMY_PK,
    );
    return { base64: encodeTxToBase64(tx) };
});

// ── 6. Sign & send a real transaction ──────────────────────────────────────────
await run("sign & send – transfer 0.01 NEAR to test.testnet", async () => {
    const privateKey = process.env.NEAR_PRIVATE_KEY as KeyPairString;
    if (!privateKey) throw new Error("NEAR_PRIVATE_KEY env var not set");

    const signer = KeyPairSigner.fromSecretKey(privateKey);
    const pk = await signer.getPublicKey();

    // Build unsigned tx (Transaction class instance)
    const tx = await transferNearTx(NETWORK, TEST_ACCOUNT, "test.testnet", "0.01", pk.toString() as KeyPairString);

    // Sign directly — no encode/decode roundtrip needed since we have the instance
    const { signedTransaction } = await signer.signTransaction(tx);

    // Send it
    const hash = await sendTransaction(NETWORK, signedTransaction);
    return { txHash: hash };
});

// ── 7. Transaction status (use a known testnet hash if you have one) ─────────
// await run("getTransactionStatus", async () =>
//     getTransactionStatus(NETWORK, "<TX_HASH>", TEST_ACCOUNT)
// );

// ── Summary ───────────────────────────────────────────────────────────────────
const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok).length;
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${results.length} tests`);
if (failed > 0) {
    console.log("\nFailed tests:");
    results.filter(r => !r.ok).forEach(r => console.log(`  ✗ ${r.name}: ${r.error}`));
    process.exit(1);
}
