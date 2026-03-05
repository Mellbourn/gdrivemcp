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

function formatFiles(files: any[]): string {
  return files
    .map((f) => {
      const name = f.name ?? "(unnamed)";
      const type = f.mimeType ?? "";
      const modified = f.modifiedTime ?? "";
      const link = f.webViewLink ?? "";
      return `${name}\n  ID: ${f.id}\n  Type: ${type}\n  Modified: ${modified}\n  Link: ${link}`;
    })
    .join("\n\n");
}

server.registerTool(
  "drive_search",
  {
    description: "Search Google Drive files",
    inputSchema: {
      query: z
        .string()
        .describe("Google Drive query, e.g. \"name contains 'report'\""),
      maxResults: z.number().optional().default(10),
      pageToken: z
        .string()
        .optional()
        .describe("Token from previous search to get next page"),
    },
  },
  async ({ query, maxResults, pageToken }) => {
    const res = await drive.files.list({
      q: query,
      pageSize: maxResults,
      pageToken: pageToken,
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)",
    });
    const files = res.data.files ?? [];
    if (files.length === 0) {
      return {
        content: [{ type: "text", text: "No files found." }],
      };
    }
    let text = formatFiles(files);
    if (res.data.nextPageToken) {
      text += `\n\nNext page token: ${res.data.nextPageToken}`;
    }
    return { content: [{ type: "text", text }] };
  }
);

server.registerTool(
  "drive_list_folder",
  {
    description: "List files in a Google Drive folder",
    inputSchema: {
      folderId: z.string().optional().default("root"),
      maxResults: z.number().optional().default(20),
      pageToken: z.string().optional(),
    },
  },
  async ({ folderId, maxResults, pageToken }) => {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      pageSize: maxResults,
      pageToken: pageToken,
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)",
    });
    const files = res.data.files ?? [];
    if (files.length === 0) {
      return { content: [{ type: "text", text: "No files found." }] };
    }
    let text = formatFiles(files);
    if (res.data.nextPageToken) {
      text += `\n\nNext page token: ${res.data.nextPageToken}`;
    }
    return { content: [{ type: "text", text }] };
  }
);

const GOOGLE_MIME_EXPORT: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

server.registerTool(
  "drive_read_file",
  {
    description: "Read the text content of a Google Drive file by ID",
    inputSchema: {
      fileId: z.string(),
    },
  },
  async ({ fileId }) => {
    const meta = await drive.files.get({ fileId, fields: "name,mimeType" });
    const mimeType = meta.data.mimeType ?? "";

    if (GOOGLE_MIME_EXPORT[mimeType]) {
      const res = await drive.files.export(
        { fileId, mimeType: GOOGLE_MIME_EXPORT[mimeType] },
        { responseType: "text" }
      );
      return { content: [{ type: "text", text: res.data as string }] };
    } else if (mimeType.startsWith("text/") || mimeType === "application/json") {
      const res = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "text" }
      );
      return { content: [{ type: "text", text: res.data as string }] };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Cannot read binary file (${mimeType}). Use drive_search to find text files.`,
          },
        ],
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("gdrivemcp server started");
