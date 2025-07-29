import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  ConnectMcpParams,
  McpConfig,
  McpServerConfig,
} from "./types.js";

/**
 * Find blueprint ID from command line arguments or environment variable
 */
function findBlueprintId(): string | undefined {
  // Check environment variable
  if (process.env.MCP_BLUEPRINT_ID) {
    return process.env.MCP_BLUEPRINT_ID;
  }

  // Check command line arguments
  const blueprintArgIndex = process.argv.findIndex(
    (arg) => arg === "--blueprint-id"
  );
  if (
    blueprintArgIndex !== -1 &&
    blueprintArgIndex < process.argv.length - 1
  ) {
    return process.argv[blueprintArgIndex + 1];
  }

  return undefined;
}

/**
 * Fetch configuration from API using blueprint ID
 */
async function fetchConfigFromApi(blueprintId: string): Promise<McpConfig> {
  try {
    const url = `https://muxio.vercel.app/api/blueprint-servers?blueprint_id=${blueprintId}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const config = await response.json() as McpConfig;
    
    if (!config.mcpServers) {
      throw new Error("Invalid configuration format: missing mcpServers");
    }
    
    return config;
  } catch (error) {
    console.error(
      `Failed to fetch configuration from API: ${
        (error as Error).message
      }`
    );
    throw new Error(
      `Failed to fetch configuration for blueprint '${blueprintId}': ${
        (error as Error).message
      }`
    );
  }
}

export class McpServerManager {
  private clients: Map<string, Client> = new Map();
  private blueprintId?: string;

  /**
   * MCP Server Manager constructor
   */
  constructor(options?: {
    blueprintId?: string;
    autoLoad?: boolean;
  }) {
    this.blueprintId =
      options?.blueprintId || findBlueprintId();

    if (options?.autoLoad && this.blueprintId) {
      // Note: Can't await in constructor, so we'll just start the loading process
      this.loadFromBlueprint(this.blueprintId).catch((error) => {
        console.error(
          `Failed to load servers from blueprint: ${
            (error as Error).message
          }`
        );
      });
    }
  }

  /**
   * Load server configuration from API using blueprint ID
   */
  async loadFromBlueprint(blueprintId?: string): Promise<void> {
    const id = blueprintId || this.blueprintId;
    if (!id) {
      throw new Error(
        "Blueprint ID not specified."
      );
    }

    const config = await fetchConfigFromApi(id);

    if (
      !config.mcpServers ||
      Object.keys(config.mcpServers).length === 0
    ) {
      console.warn(
        "No server information in blueprint configuration."
      );
      return;
    }

    // Connect to all servers
    const serverEntries = Object.entries(config.mcpServers);
    for (const [
      serverName,
      serverConfig,
    ] of serverEntries) {
      if (this.clients.has(serverName)) {
        continue;
      }

      try {
        await this.connectToServer(
          serverName,
          serverConfig as McpServerConfig
        );
      } catch (error) {
        console.error(
          `Failed to connect to server '${serverName}' from blueprint: ${
            (error as Error).message
          }`
        );
      }
    }
  }

  /**
   * Connect to MCP server.
   */
  async connectToServer(
    serverName: string,
    params: ConnectMcpParams | McpServerConfig
  ): Promise<void> {
    if (this.clients.has(serverName)) {
      throw new Error(
        `Already connected to server '${serverName}'.`
      );
    }

    // Determine transport type
    const transportType = params.type || (params.command ? "stdio" : "http");
    
    let transport: StdioClientTransport | StreamableHTTPClientTransport;

    if (transportType === "http") {
      // HTTP transport
      if (!params.url) {
        throw new Error(
          `HTTP server '${serverName}' requires a URL.`
        );
      }
      
      const url = new URL(params.url);
      
      // Create transport with headers in requestInit
      const transportOptions: any = {};
      if (params.headers) {
        transportOptions.requestInit = {
          headers: params.headers
        };
      }
      
      transport = new StreamableHTTPClientTransport(url, transportOptions);
    } else {
      // Stdio transport
      if (!params.command) {
        throw new Error(
          `Stdio server '${serverName}' requires a command.`
        );
      }

      // Set environment variables
      const env: Record<string, string | undefined> = {
        ...process.env,
      };
      if ("env" in params && params.env) {
        Object.assign(env, params.env);
      }

      transport = new StdioClientTransport({
        command: params.command,
        args: params.args || [],
        env: env as Record<string, string>,
      });
    }

    const client = new Client({
      name: `mcp-client-${serverName}`,
      version: "1.0.0",
    });

    try {
      await client.connect(transport);
      this.clients.set(serverName, client);
    } catch (error) {
      console.error(
        `Failed to connect to server '${serverName}':`,
        error
      );
      throw new Error(
        `Failed to connect to server '${serverName}': ${
          (error as Error).message
        }`
      );
    }
  }

  /**
   * Return the list of tools from connected server.
   */
  async listTools(serverName: string): Promise<any> {
    const client = this.getClient(serverName);
    return await client.listTools();
  }

  /**
   * Get a specific tool with complete schema from a connected server.
   */
  async getTool(serverName: string, toolName: string): Promise<any> {
    const client = this.getClient(serverName);
    const toolsResponse = await client.listTools();
    
    if (!toolsResponse.tools || !Array.isArray(toolsResponse.tools)) {
      throw new Error(`No tools found on server '${serverName}'`);
    }

    const tool = toolsResponse.tools.find((t: any) => t.name === toolName);
    
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found on server '${serverName}'`);
    }

    return tool;
  }

  /**
   * List tools from a specific server (name and description only).
   */
  async listToolsInServer(serverName: string): Promise<any> {
    const client = this.getClient(serverName);
    const toolsResponse = await client.listTools();
    
    if (!toolsResponse.tools || !Array.isArray(toolsResponse.tools)) {
      return { tools: [] };
    }

    // Filter to only include name and description
    return {
      tools: toolsResponse.tools.map((tool: any) => ({
        name: tool.name,
        description: tool.description,
      }))
    };
  }

  /**
   * Find tools matching a pattern in a specific server (name and description only).
   */
  async findToolsInServer(
    serverName: string,
    pattern: string,
    searchIn: "name" | "description" | "both" = "both",
    caseSensitive: boolean = false
  ): Promise<any[]> {
    const client = this.getClient(serverName);
    const toolsResponse = await client.listTools();

    if (!toolsResponse.tools || !Array.isArray(toolsResponse.tools)) {
      return [];
    }

    const flags = caseSensitive ? "g" : "gi";
    const regex = new RegExp(pattern, flags);

    const matchedTools = toolsResponse.tools.filter((tool: any) => {
      const nameMatch = searchIn !== "description" && tool.name && regex.test(tool.name);
      const descriptionMatch = searchIn !== "name" && tool.description && regex.test(tool.description);
      return nameMatch || descriptionMatch;
    });

    // Filter to only include name and description
    return matchedTools.map((tool: any) => ({
      name: tool.name,
      description: tool.description,
    }));
  }

  /**
   * List all connected server names.
   */
  listServers(): string[] {
    return this.getConnectedServers();
  }

  /**
   * Call a tool on server.
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<any> {
    const client = this.getClient(serverName);
    return await client.callTool({
      name: toolName,
      arguments: args,
    });
  }

  /**
   * Return all connected server names.
   */
  getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Find tools matching a pattern across all connected servers.
   */
  async findTools(
    pattern: string,
    options: {
      searchIn?: "name" | "description" | "both";
      caseSensitive?: boolean;
    } = {}
  ): Promise<Record<string, any[]>> {
    const { searchIn = "both", caseSensitive = false } = options;
    const servers = this.getConnectedServers();
    
    if (servers.length === 0) {
      return {};
    }

    // Create regex pattern
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, caseSensitive ? "" : "i");
    } catch (error) {
      throw new Error(`Invalid regex pattern: ${(error as Error).message}`);
    }

    const results: Record<string, any[]> = {};

    // Search tools in each server
    for (const serverName of servers) {
      try {
        const toolsResponse = await this.listTools(serverName);
        
        if (toolsResponse.tools && Array.isArray(toolsResponse.tools)) {
          const matchedTools = toolsResponse.tools.filter((tool: any) => {
            const nameMatch = searchIn !== "description" && tool.name && regex.test(tool.name);
            const descriptionMatch = searchIn !== "name" && tool.description && regex.test(tool.description);
            return nameMatch || descriptionMatch;
          }).map((tool: any) => ({
            name: tool.name,
            description: tool.description,
          }));

          if (matchedTools.length > 0) {
            results[serverName] = matchedTools;
          }
        }
      } catch (error) {
        // Include error information in results
        results[serverName] = [{
          error: `Failed to search tools: ${(error as Error).message}`
        }];
      }
    }

    return results;
  }

  /**
   * Disconnect from server.
   */
  async disconnectServer(
    serverName: string
  ): Promise<void> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(
        `Not connected to server '${serverName}'.`
      );
    }
    try {
      await client.close();
      this.clients.delete(serverName);
    } catch (error) {
      console.error(
        `Failed to disconnect from server '${serverName}':`,
        error
      );
      throw new Error(
        `Failed to disconnect from server '${serverName}': ${
          (error as Error).message
        }`
      );
    }
  }

  /**
   * Disconnect from all servers.
   */
  async disconnectAll(): Promise<void> {
    const serverNames = this.getConnectedServers();
    for (const serverName of serverNames) {
      await this.disconnectServer(serverName);
    }
  }

  private getClient(serverName: string): Client {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(
        `Not connected to server '${serverName}'.`
      );
    }
    return client;
  }
}
