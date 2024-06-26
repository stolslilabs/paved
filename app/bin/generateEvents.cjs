#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const starknet = require("starknet");

// Check for the required arguments
if (process.argv.length !== 4) {
  console.log("Usage: <script> <manifest-path> <output-path>");
  process.exit(1);
}

// Extract paths from command-line arguments
const jsonFilePath = path.resolve(process.argv[2]);
const jsFilePath = path.resolve(process.argv[3]);

const cairoToTypescriptType = {
  bool: "boolean",
  u8: "number",
  u16: "number",
  u32: "number",
  u64: "number",
  usize: "number",
  u128: "bigint",
  u256: "bigint",
  felt252: "string",
  ContractAddress: "string",
};

fs.readFile(jsonFilePath, "utf8", (err, jsonString) => {
  if (err) {
    console.log("Error reading file:", err);
    return;
  }

  try {
    const data = JSON.parse(jsonString);

    let eventsMeta = [];

    for (let contract of data.contracts) {
      const events = contract.abi.filter(
        (i) => i.type === "event" && i.kind === "struct",
      );

      for (let event of events) {
        const shortName = event.name.substring(
          event.name.lastIndexOf("::") + 2,
        );
        const selector =
          "0x" + starknet.hash.starknetKeccak(shortName).toString(16);
        const members = event.members.map((member) => {
          const cairoType = member.type.substring(
            member.type.lastIndexOf("::") + 2,
          );
          return {
            name: member.name,
            kind: member.kind,
            cairoType,
            type: cairoToTypescriptType[cairoType] || "String",
          };
        });

        if (eventsMeta.find((i) => i.name === shortName)) {
          console.log(`duplicate eventName : ${shortName}`);
        } else {
          eventsMeta.push({
            name: shortName,
            selector,
            members,
          });
        }

        // console.log(shortName)
        // console.log(selector)
        // console.log(members)
        // console.log("\n")
      }
    }

    const eventsEnum = `export enum WorldEvents {\n ${eventsMeta
      .map((e) => `${e.name}= "${e.selector}",\n`)
      .join("")}};\n\n`;

    const baseEventData = `
      export interface BaseEventData {
        game_id: number;
        event_type: WorldEvents;
        event_name: string;
      }\n\n\n`;

    const eventsData = eventsMeta
      .map((e) => {
        if (e.name === "Upgraded") return;
        return `export interface ${e.name}Data extends BaseEventData {
        ${e.members.map((m) => `${m.name}: ${m.type};`).join("\n")}
        }\n\n`;
      })
      .join("");

    const parseEvents = `
      export const parseAllEvents = (receipt: GetTransactionReceiptResponse) => {
      if (receipt.status === "REJECTED") {
          throw new Error(\`transaction REJECTED\`);
      }
      if (receipt.status === "REVERTED") {
          throw new Error(\`transaction REVERTED\`);
      }
    
      const flatEvents = parseEvents(receipt as SuccessfulTransactionReceiptResponse)
      return flatEvents
    }
    
    export const parseEvents = (receipt: SuccessfulTransactionReceiptResponse) => {
      const parsed = receipt.events.map(e => parseEvent(e))
      return parsed
    }
    
    export type ParseEventResult = ReturnType<typeof parseEvent>;\n\n
    `;

    let parseEventInner = eventsMeta
      .map((event) => {
        if (event.name === "Upgraded") return;

        let keyCount = 1; // first key is selector
        let dataCount = 0;
        let code = `case WorldEvents.${event.name}:\n`;
        code += `return {\n`;
        code += `event_type: WorldEvents.${event.name},\n`;
        code += `event_name: "${event.name}",\n`;
        for (let member of event.members) {
          code += `${member.name}: `;
          const prop =
            member.kind === "key"
              ? `raw.keys[${keyCount++}]`
              : `raw.data[${dataCount++}]`;
          switch (member.type) {
            case "boolean":
              code += `${prop} === "0x0" ? false : true,\n`;
              break;
            case "number":
              code += `Number(${prop}),\n`;
              break;
            case "bigint":
              code += `BigInt(${prop}),\n`;
              break;
            default:
              code += `num.toHexString(${prop}),\n`;
              break;
          }
        }
        code += `} as ${event.name}Data;\n`;
        return code;
      })
      .join("\n");

    parseEventInner += `\n
    default:
      return {
        gameId: undefined,
        event_type: raw.keys[0],
        event_name: raw.keys[0],
      }
    break;\n\n`;

    const parseEvent = `
    export const parseEvent = (raw: any) => {
      switch (raw.keys[0]) {
          ${parseEventInner}
      }
    }\n\n
    `;

    // console.log(eventsEnum)
    // console.log(eventsData)

    let fileContent = `/* Autogenerated file. Do not edit manually. */\n\n`;
    fileContent += `import {num, GetTransactionReceiptResponse, InvokeTransactionReceiptResponse, SuccessfulTransactionReceiptResponse, Contract } from "starknet";\n\n`;

    fileContent += eventsEnum;
    fileContent += baseEventData;
    fileContent += eventsData;
    fileContent += parseEvents;
    fileContent += parseEvent;

    fs.writeFile(jsFilePath, fileContent, (err) => {
      if (err) {
        console.log("Error writing file:", err);
      } else {
        console.log("File generated successfully");
      }
    });
  } catch (err) {
    console.log("Error parsing JSON string:", err);
  }
});
