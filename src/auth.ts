import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { createServer } from "http";
import { readFile, writeFile } from "fs/promises";
import { exec } from "child_process";

const TOKEN_PATH = process.env.HOME + "/.gdrivemcp-tokens.json";
const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];
const REDIRECT_PORT = 3141;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

export function createOAuth2Client(): OAuth2Client {
  const clientId = process.env.GDRIVE_CLIENT_ID;
  const clientSecret = process.env.GDRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GDRIVE_CLIENT_ID or GDRIVE_CLIENT_SECRET environment variables"
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
}

export async function loadTokens(client: OAuth2Client): Promise<boolean> {
  try {
    const data = await readFile(TOKEN_PATH, "utf-8");
    client.setCredentials(JSON.parse(data));
    return true;
  } catch {
    return false;
  }
}

export async function saveTokens(client: OAuth2Client): Promise<void> {
  const credentials = client.credentials;
  await writeFile(TOKEN_PATH, JSON.stringify(credentials), "utf-8");
}

function openBrowser(url: string): void {
  const platform = process.platform;
  let cmd: string;
  if (platform === "darwin") {
    cmd = `open "${url}"`;
  } else if (platform === "win32") {
    cmd = `start "" "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }
  exec(cmd);
}

export async function runAuthFlow(client: OAuth2Client): Promise<void> {
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });

  console.error("Opening browser for Google OAuth...");
  console.error("Auth URL:", authUrl);
  openBrowser(authUrl);

  await new Promise<void>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url!, `http://localhost:${REDIRECT_PORT}`);
        if (url.pathname !== "/callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const code = url.searchParams.get("code");
        if (!code) {
          res.writeHead(400);
          res.end("Missing code parameter");
          reject(new Error("No code in callback"));
          return;
        }
        const { tokens } = await client.getToken(code);
        client.setCredentials(tokens);
        await saveTokens(client);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h1>Authentication successful!</h1><p>You can close this tab.</p></body></html>"
        );
        server.close();
        resolve();
      } catch (err) {
        res.writeHead(500);
        res.end("Authentication error");
        server.close();
        reject(err);
      }
    });

    server.listen(REDIRECT_PORT, () => {
      console.error(`Waiting for OAuth callback on port ${REDIRECT_PORT}...`);
    });

    server.on("error", reject);
  });

  console.error("Authentication successful, tokens saved.");
}

export async function getAuthenticatedClient(): Promise<OAuth2Client> {
  const client = createOAuth2Client();
  const loaded = await loadTokens(client);
  if (!loaded) {
    await runAuthFlow(client);
  }
  client.on("tokens", async (tokens) => {
    client.setCredentials(tokens);
    await saveTokens(client);
  });
  return client;
}
