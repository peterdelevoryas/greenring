export type ChatCommandName =
  | "help"
  | "clear"
  | "joinvoice"
  | "leavevoice"
  | "leaveparty"
  | "parties";

export type ParsedChatCommand =
  | {
      known: true;
      name: ChatCommandName;
      args: string[];
      raw: string;
    }
  | {
      known: false;
      name: string;
      args: string[];
      raw: string;
    };

export const SUPPORTED_CHAT_COMMANDS: Array<{ name: ChatCommandName; description: string }> = [
  { name: "help", description: "show the local command list" },
  { name: "clear", description: "clear local scrollback until reload" },
  { name: "joinvoice", description: "join the party voice lane" },
  { name: "leavevoice", description: "leave the current voice lane" },
  { name: "leaveparty", description: "leave the current party and return to the dashboard" },
  { name: "parties", description: "return to the party dashboard without leaving" },
];

const KNOWN_COMMANDS = new Set<ChatCommandName>(
  SUPPORTED_CHAT_COMMANDS.map((command) => command.name),
);

export function parseChatCommand(input: string): ParsedChatCommand | null {
  const raw = input.trim();
  if (!raw.startsWith("/")) {
    return null;
  }

  const [name = "", ...args] = raw
    .slice(1)
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const normalizedName = name.toLowerCase();

  if (KNOWN_COMMANDS.has(normalizedName as ChatCommandName)) {
    return {
      known: true,
      name: normalizedName as ChatCommandName,
      args,
      raw,
    };
  }

  return {
    known: false,
    name: normalizedName,
    args,
    raw,
  };
}

export function buildCommandHelpText() {
  return [
    "Supported commands:",
    ...SUPPORTED_CHAT_COMMANDS.map(
      (command) => `/${command.name} - ${command.description}`,
    ),
  ].join("\n");
}

export function getSlashCommandSuggestions(input: string) {
  const trimmedLeft = input.trimStart();
  if (!trimmedLeft.startsWith("/")) {
    return [];
  }

  const withoutSlash = trimmedLeft.slice(1);
  if (withoutSlash.includes(" ") || withoutSlash.includes("\n")) {
    return [];
  }

  const query = withoutSlash.toLowerCase();
  return SUPPORTED_CHAT_COMMANDS.filter((command) => command.name.startsWith(query));
}

export function isKnownSlashCommandName(name: string) {
  return KNOWN_COMMANDS.has(name.toLowerCase() as ChatCommandName);
}
