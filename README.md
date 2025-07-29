# Muxio MCP Server

A hub server that connects to and manages other MCP (Model Context Protocol) servers.

## Overview

This project builds an MCP hub server that connects to and manages multiple MCP (Model Context Protocol) servers through a single interface.
It helps prevent excessive context usage and pollution from infrequently used MCPs (e.g., Atlassian MCP, Playwright MCP) by allowing you to connect them only when needed.
This reduces AI mistakes and improves performance by keeping the active tool set focused and manageable.

## Key Features

- Automatic connection to other MCP servers via configuration file
- List available tools on connected servers
- Call tools on connected servers and return results

## Configuration

Add this to your `mcp.json`:

#### Using npx

```json
{
  "mcpServers": {
    "other-tools": {
      "command": "npx",
      "args": [
        "-y",
        "muxio-mcp",
        "--config-path",
        "/Users/username/mcp.json"
      ]
    }
  }
}
```


## Installation and Running

### Requirements

- Node.js 18.0.0 or higher
- npm, yarn, or pnpm

### Installation

```bash
# Clone repository
git clone <repository-url>
cd muxio-mcp

# Install dependencies
npm install
# or
yarn install
# or
pnpm install
```

### Build

```bash
npm run build
# or
yarn build
# or
pnpm build
```

### Run

```bash
npm start
# or
yarn start
# or
pnpm start
```

### Development Mode

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

## Configuration File

The Muxio MCP server uses a Claude Desktop format configuration file to automatically connect to other MCP servers.
You can specify the configuration file in the following ways:

1. Environment variable: Set the `MCP_CONFIG_PATH` environment variable to the configuration file path
2. Command line argument: Use the `--config-path` option to specify the configuration file path
3. Default path: Use `mcp-config.json` file in the current directory

Configuration file format:

```json
{
  "mcpServers": {
    "serverName1": {
      "command": "command",
      "args": ["arg1", "arg2", ...],
      "env": { "ENV_VAR1": "value1", ... }
    },
    "serverName2": {
      "command": "anotherCommand",
      "args": ["arg1", "arg2", ...]
    }
  }
}
```

Example:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/username/Desktop",
        "/Users/username/Downloads"
      ]
    },
    "other-server": {
      "command": "node",
      "args": ["path/to/other-mcp-server.js"]
    }
  }
}
```

## Usage

The Muxio MCP server provides the following tools:

### 1. `list-all-tools`

Returns a list of tools from all connected servers.

```json
{
  "name": "list-all-tools",
  "arguments": {}
}
```

### 2. `call-tool`

Calls a tool on a specific server.

- `serverName`: Name of the MCP server to call the tool from
- `toolName`: Name of the tool to call
- `toolArgs`: Arguments to pass to the tool

```json
{
  "name": "call-tool",
  "arguments": {
    "serverName": "filesystem",
    "toolName": "readFile",
    "toolArgs": {
      "path": "/Users/username/Desktop/example.txt"
    }
  }
}
```

### 3. `find-tools`

Find tools matching a regex pattern across all connected servers (grep-like functionality).

- `pattern`: Regex pattern to search for in tool names and descriptions
- `searchIn`: Where to search: "name", "description", or "both" (default: "both")
- `caseSensitive`: Whether the search should be case-sensitive (default: false)

```json
{
  "name": "find-tools",
  "arguments": {
    "pattern": "file",
    "searchIn": "both",
    "caseSensitive": false
  }
}
```

Example patterns:
- `"file"` - Find all tools containing "file"
- `"^read"` - Find all tools starting with "read"
- `"(read|write).*file"` - Find tools for reading or writing files
- `"config$"` - Find tools ending with "config"

Example output:
```json
{
  "filesystem": [
    {
      "name": "readFile",
      "description": "Read the contents of a file",
      "inputSchema": {
        "type": "object",
        "properties": {
          "path": {
            "type": "string",
            "description": "Path to the file to read"
          }
        },
        "required": ["path"]
      }
    },
    {
      "name": "writeFile",
      "description": "Write content to a file",
      "inputSchema": {
        "type": "object",
        "properties": {
          "path": {
            "type": "string",
            "description": "Path to the file to write"
          },
          "content": {
            "type": "string",
            "description": "Content to write to the file"
          }
        },
        "required": ["path", "content"]
      }
    }
  ]
}
```

## Commit Message Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/) for automatic versioning and CHANGELOG generation.

Format: `<type>(<scope>): <description>`

Examples:

- `feat: add new hub connection feature`
- `fix: resolve issue with server timeout`
- `docs: update API documentation`
- `chore: update dependencies`

Types:

- `feat`: New feature (MINOR version bump)
- `fix`: Bug fix (PATCH version bump)
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools

Breaking Changes:
Add `BREAKING CHANGE:` in the commit footer to trigger a MAJOR version bump.