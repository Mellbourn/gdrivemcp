import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "gdrivemcp",
  version: "0.1.0",
});

server.registerTool(
  "hello",
  {
    description: "Greet someone and confirm the Google Drive MCP server is alive",
    inputSchema: {
      name: z.string().describe("The name to greet"),
    },
  },
  async ({ name }) => {
    return {
      content: [
        {
          type: "text",
          text: `Hello, ${name}! Google Drive MCP is alive.`,
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("gdrivemcp server started");
