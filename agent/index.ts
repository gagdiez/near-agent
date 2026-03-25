#!/usr/bin/env node
import { anthropic } from "@ai-sdk/anthropic";
import { ModelMessage, stepCountIs, streamText } from "ai";
import "dotenv/config";
import { Account, KeyPairSigner, KeyPairString } from "near-api-js";
import * as readline from "readline";
import { createNearTools } from "../tools/tools.js";
import { createSignerTools } from "../tools/signer-tools.js";
import { createMpcTools } from "../tools/mpc-tools.js";

const SYSTEM_PROMPT = `You are a NEAR Protocol agent that can check balances, build transactions, sign them, and broadcast them.

You have access to tools that let you interact with NEAR. The flow for sending funds is:
  1. Call get_public_key to get the signer's public key (needed to build transactions)
  2. Call the appropriate tx-building tool (transfer_near, transfer_token, call_function)
  3. Call sign_transaction with the returned unsignedTxBase64
  4. Call send_transaction with the returned signedTxBase64

Rules:
- Default to testnet unless the user specifies mainnet
- Always confirm the key details (amount, recipient) with the user before broadcasting
- Use the most specific tool for the task
- Always show balances in decimal form with the appropriate token symbol (e.g. "1.5 USDC", not "1500000"), except if the user specifically asks for raw units
- NEVER ASK THE USER FOR A PRIVATE KEY. The signer tools handle all signing, and the private key never leaves that process.
- I am still debugging, so on error please show me the full error message
`;

async function main() {

  const signer = KeyPairSigner.fromSecretKey(process.env.NEAR_PRIVATE_KEY as KeyPairString);

  const nearAccount = new Account(
    process.env.NEAR_ACCOUNT_ID!,
    'https://test.rpc.fastnear.com',
    signer
  )

  const tools = {
    ...createNearTools({ defaultNetwork: "testnet" }),
    ...createSignerTools(signer),
    // @ts-expect-error Account is practically the same
    ...(await createMpcTools({ nearAccount, derivationPath: '0' }))
  };

  const history: ModelMessage[] = [];

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = () => {
    rl.question("you: ", async (userInput) => {
      const message = userInput.trim();
      if (!message) { ask(); return; }

      history.push({ role: "user", content: message });

      const result = streamText({
        model: anthropic("claude-haiku-4-5"),
        system: SYSTEM_PROMPT,
        messages: history,
        tools,
        stopWhen: stepCountIs(10),
        temperature: 0,
        maxOutputTokens: 2048,
      });

      process.stdout.write("\nagent: ");

      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          process.stdout.write(part.text);
        } else if (part.type === "tool-call") {
          process.stdout.write(`\n  [calling ${part.toolName}]\n`);
        } else if (part.type === "tool-result") {
          process.stdout.write(`  [${part.toolName} done]\n`);
        }
      }

      process.stdout.write("\n\n");
      // Append all new messages (text + tool calls + tool results) so the
      // model has full context of what happened in this turn.
      const { messages: responseMessages } = await result.response;
      history.push(...responseMessages as ModelMessage[]);

      ask();
    });
  };

  ask();
}

main().catch(console.error);
