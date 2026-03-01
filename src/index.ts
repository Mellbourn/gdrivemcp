import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { google } from "googleapis";
import { getAuthenticatedClient } from "./auth.js";

const server = new McpServer({
  name: "gdrivemcp",
  version: "0.2.0",
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

const auth = await getAuthenticatedClient();
const drive = google.drive({ version: "v3", auth });

server.registerTool(
  "drive_search",
  {
    description: "Search Google Drive files",
    inputSchema: {
      query: z
        .string()
        .describe("Google Drive query, e.g. \"name contains 'report'\""),
      maxResults: z.number().optional().default(10),
    },
  },
  async ({ query, maxResults }) => {
    const res = await drive.files.list({
      q: query,
      pageSize: maxResults,
      fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
    });
    const files = res.data.files ?? [];
    if (files.length === 0) {
      return {
        content: [{ type: "text", text: "No files found." }],
      };
    }
    const lines = files.map((f) => {
      const name = f.name ?? "(unnamed)";
      const type = f.mimeType ?? "";
      const modified = f.modifiedTime ?? "";
      const link = f.webViewLink ?? "";
      return `${name}\n  ID: ${f.id}\n  Type: ${type}\n  Modified: ${modified}\n  Link: ${link}`;
    });
    return {
      content: [{ type: "text", text: lines.join("\n\n") }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("gdrivemcp server started");
