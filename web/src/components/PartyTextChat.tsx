import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, getPartyMessages, sendPartyMessage } from "../lib/api";
import {
  buildCommandHelpText,
  getSlashCommandSuggestions,
  isKnownSlashCommandName,
  parseChatCommand,
} from "../lib/chatCommands";
import type { PartyMessage, UserSummary } from "../lib/types";
import { UserAvatar } from "./UserAvatar";

type SystemTone = "muted" | "error" | "help" | "success";

type ChatEntry =
  | {
      kind: "message";
      id: string;
      createdAt: string;
      message: PartyMessage;
    }
  | {
      kind: "system";
      id: string;
      createdAt: string;
      tone: SystemTone;
      body: string;
    };

export function PartyTextChat({
  currentUser,
  isInParty,
  isVoiceConnected,
  isVoiceConnecting,
  onConnectVoice,
  onDisconnectVoice,
  onLeaveParty,
  onNavigateToParties,
  partyId,
  partyName,
}: {
  currentUser: UserSummary;
  isInParty: boolean;
  isVoiceConnected: boolean;
  isVoiceConnecting: boolean;
  onConnectVoice: () => Promise<void>;
  onDisconnectVoice: () => Promise<void>;
  onLeaveParty: () => Promise<void>;
  onNavigateToParties: () => void;
  partyId: string;
  partyName: string;
}) {
  const queryClient = useQueryClient();
  const messagesQuery = useQuery({
    queryKey: ["messages", partyId],
    queryFn: () => getPartyMessages(partyId),
    enabled: Boolean(partyId),
  });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const forceScrollRef = useRef(false);

  const [draft, setDraft] = useState("");
  const [clearCutoff, setClearCutoff] = useState<number | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [localEntries, setLocalEntries] = useState<ChatEntry[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

  const persistedEntries = (messagesQuery.data?.messages ?? []).map<ChatEntry>((message) => ({
    kind: "message",
    id: message.id,
    createdAt: message.created_at,
    message,
  }));
  const renderedEntries = [...persistedEntries, ...localEntries]
    .filter((entry) => {
      if (clearCutoff === null) {
        return true;
      }
      return createdAtToMillis(entry.createdAt) >= clearCutoff;
    })
    .sort((left, right) => {
      const timeDelta = createdAtToMillis(left.createdAt) - createdAtToMillis(right.createdAt);
      if (timeDelta !== 0) {
        return timeDelta;
      }
      return left.id.localeCompare(right.id);
    });
  const hadPersistedMessages = persistedEntries.length > 0;
  const commandSuggestions = getSlashCommandSuggestions(draft);
  const showCommandSuggestions = commandSuggestions.length > 0;
  const activeSuggestion = showCommandSuggestions
    ? commandSuggestions[Math.min(selectedSuggestionIndex, commandSuggestions.length - 1)]
    : null;
  const trimmedDraft = draft.trimStart();
  const commandStem = trimmedDraft.startsWith("/") ? trimmedDraft.slice(1).toLowerCase() : "";
  const shouldAutocompleteOnEnter = Boolean(
    activeSuggestion
      && commandStem.length > 0
      && !isKnownSlashCommandName(commandStem),
  );

  const sendMessageMutation = useMutation({
    mutationFn: (body: string) => sendPartyMessage(partyId, body),
    onSuccess: () => {
      forceScrollRef.current = true;
      setDraft("");
      focusPrompt();
      queryClient.invalidateQueries({ queryKey: ["messages", partyId] });
      queryClient.invalidateQueries({ queryKey: ["home"] });
    },
    onError: (mutationError) => {
      appendSystemEntry(readableError(mutationError, "Could not send that message."), "error");
    },
  });

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 52), 200)}px`;
  }, [draft]);

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) {
      return;
    }

    if (!forceScrollRef.current && !isNearBottom) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      feed.scrollTop = feed.scrollHeight;
      forceScrollRef.current = false;
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [isNearBottom, renderedEntries.length]);

  useEffect(() => {
    setSelectedSuggestionIndex(0);
  }, [draft]);

  function focusPrompt() {
    textareaRef.current?.focus();
  }

  function appendSystemEntry(body: string, tone: SystemTone) {
    forceScrollRef.current = true;
    setLocalEntries((current) => [
      ...current,
      {
        kind: "system",
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${current.length}`,
        createdAt: new Date().toISOString(),
        tone,
        body,
      },
    ]);
  }

  function applyCommandSuggestion(commandName: string) {
    setDraft(`/${commandName}`);
    setSelectedSuggestionIndex(0);

    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      const position = textarea.value.length;
      textarea.focus();
      textarea.setSelectionRange(position, position);
    });
  }

  async function handleCommand(commandText: string) {
    const parsed = parseChatCommand(commandText);
    if (!parsed) {
      return false;
    }

    if (!parsed.known) {
      appendSystemEntry(
        parsed.name
          ? `Unknown command: /${parsed.name}. Try /help.`
          : "Unknown command. Try /help.",
        "error",
      );
      return false;
    }

    if (parsed.args.length > 0) {
      appendSystemEntry(`/${parsed.name} does not take arguments in this build.`, "error");
      return false;
    }

    switch (parsed.name) {
      case "help":
        appendSystemEntry(buildCommandHelpText(), "help");
        return true;
      case "clear":
        forceScrollRef.current = true;
        setLocalEntries([]);
        setClearCutoff(Date.now());
        return true;
      case "joinvoice":
        if (isVoiceConnected) {
          appendSystemEntry("Voice is already connected.", "muted");
          return true;
        }
        if (isVoiceConnecting) {
          appendSystemEntry("Voice connection is already in progress.", "muted");
          return true;
        }
        try {
          await onConnectVoice();
          appendSystemEntry("Voice connected.", "success");
          return true;
        } catch (commandError) {
          appendSystemEntry(
            readableError(commandError, "Could not connect voice."),
            "error",
          );
          return false;
        }
      case "leavevoice":
        if (!isVoiceConnected) {
          appendSystemEntry("Voice is already disconnected.", "muted");
          return true;
        }
        try {
          await onDisconnectVoice();
          appendSystemEntry("Voice disconnected.", "success");
          return true;
        } catch (commandError) {
          appendSystemEntry(
            readableError(commandError, "Could not leave voice."),
            "error",
          );
          return false;
        }
      case "leaveparty":
        if (!isInParty) {
          appendSystemEntry("You are not currently in this party.", "error");
          return false;
        }
        try {
          await onLeaveParty();
          onNavigateToParties();
          return true;
        } catch (commandError) {
          appendSystemEntry(
            readableError(commandError, "Could not leave the party."),
            "error",
          );
          return false;
        }
      case "parties":
        onNavigateToParties();
        return true;
    }
  }

  async function submitDraft() {
    const nextDraft = draft;
    const trimmed = nextDraft.trim();

    if (!trimmed || sendMessageMutation.isPending) {
      return;
    }

    if (trimmed.startsWith("/")) {
      const commandSucceeded = await handleCommand(nextDraft);
      if (commandSucceeded) {
        setDraft("");
        focusPrompt();
      }
      return;
    }

    if (!isInParty) {
      appendSystemEntry(
        "Join the party before sending room messages. Use the button or /joinvoice.",
        "error",
      );
      return;
    }

    forceScrollRef.current = true;
    sendMessageMutation.mutate(nextDraft);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showCommandSuggestions && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setSelectedSuggestionIndex((current) => {
        if (commandSuggestions.length === 0) {
          return 0;
        }

        if (event.key === "ArrowDown") {
          return (current + 1) % commandSuggestions.length;
        }

        return (current - 1 + commandSuggestions.length) % commandSuggestions.length;
      });
      return;
    }

    if (showCommandSuggestions && event.key === "Tab" && activeSuggestion) {
      event.preventDefault();
      applyCommandSuggestion(activeSuggestion.name);
      return;
    }

    if (showCommandSuggestions && event.key === "Enter" && !event.shiftKey && activeSuggestion && shouldAutocompleteOnEnter) {
      event.preventDefault();
      applyCommandSuggestion(activeSuggestion.name);
      return;
    }

    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void submitDraft();
  }

  function handleScroll() {
    const feed = feedRef.current;
    if (!feed) {
      return;
    }

    const distanceFromBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight;
    setIsNearBottom(distanceFromBottom < 48);
  }

  const promptLabel = `${currentUser.username}@${formatPromptPartyName(partyName)}>`;

  return (
    <section className="content-card party-room-main party-text-chat-card">
      <div className="glass-header">
        <p className="eyebrow">Party Text</p>
        <h2>{partyName}</h2>
        <p className="muted">
          Compact IRC-style scrollback with shell commands. Enter sends, Shift+Enter keeps writing.
        </p>
      </div>

      <div className="chat-console-frame">
        <div
          className="message-feed chat-console-feed"
          onScroll={handleScroll}
          ref={feedRef}
        >
          {messagesQuery.isLoading ? (
            <div className="empty-state chat-console-empty">
              <p>Loading scrollback...</p>
            </div>
          ) : null}

          {messagesQuery.isError ? (
            <div className="empty-state chat-console-empty">
              <p>Could not load room history.</p>
              <p className="muted">Realtime may still bring in new messages once the API recovers.</p>
            </div>
          ) : null}

          {!messagesQuery.isLoading && !messagesQuery.isError && renderedEntries.length === 0 ? (
            <div className="empty-state chat-console-empty">
              {clearCutoff !== null && hadPersistedMessages ? (
                <>
                  <p>Scrollback cleared locally.</p>
                  <p className="muted">Reload this room to restore server history.</p>
                </>
              ) : (
                <>
                  <p>No messages yet.</p>
                  <p className="muted">Drop the first line in the room or type /help.</p>
                </>
              )}
            </div>
          ) : null}

          {renderedEntries.map((entry) => (
            <ChatEntryLine entry={entry} key={`${entry.kind}-${entry.id}`} />
          ))}
        </div>

        <form
          className="message-form chat-console-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submitDraft();
          }}
        >
          <label className="visually-hidden" htmlFor="party-chat-prompt">
            Party chat prompt
          </label>
          <div className="chat-console-shell">
            <span aria-hidden="true" className="chat-console-prompt">
              {promptLabel}
            </span>
            <div className="chat-console-input-stack">
              <textarea
                aria-autocomplete="list"
                aria-controls={showCommandSuggestions ? "party-chat-command-list" : undefined}
                aria-expanded={showCommandSuggestions}
                aria-label="Party chat prompt"
                aria-activedescendant={
                  activeSuggestion ? `party-chat-command-${activeSuggestion.name}` : undefined
                }
                className="chat-console-textarea"
                disabled={messagesQuery.isLoading}
                id="party-chat-prompt"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isInParty
                    ? "Type a message or /help"
                    : "Use /joinvoice or the Join Party button, then chat"
                }
                ref={textareaRef}
                rows={1}
                value={draft}
              />
              {showCommandSuggestions ? (
                <div
                  className="chat-command-list"
                  id="party-chat-command-list"
                  role="listbox"
                >
                  {commandSuggestions.map((command, index) => {
                    const isSelected = index === selectedSuggestionIndex;
                    return (
                      <button
                        aria-selected={isSelected}
                        className={`chat-command-option ${isSelected ? "selected" : ""}`}
                        id={`party-chat-command-${command.name}`}
                        key={command.name}
                        onClick={() => applyCommandSuggestion(command.name)}
                        onMouseEnter={() => setSelectedSuggestionIndex(index)}
                        type="button"
                      >
                        <span className="chat-command-name">/{command.name}</span>
                        <span className="chat-command-description">{command.description}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          <p className="tiny-copy chat-console-hint">
            Enter sends. Shift+Enter inserts a newline. Tab or arrow keys autocomplete slash commands.
          </p>
        </form>
      </div>
    </section>
  );
}

function ChatEntryLine({ entry }: { entry: ChatEntry }) {
  if (entry.kind === "system") {
    return (
      <article className={`chat-entry chat-entry--system chat-entry--${entry.tone}`}>
        <span aria-hidden="true" className="chat-entry-marker">
          &gt;
        </span>
        <div className="chat-entry-copy">
          <div className="chat-entry-meta">
            <span className="chat-entry-time">[{formatChatTimestamp(entry.createdAt)}]</span>
            <span className="chat-entry-name">{systemLabel(entry.tone)}</span>
          </div>
          <p className="chat-entry-body">{entry.body}</p>
        </div>
      </article>
    );
  }

  return (
    <article className="chat-entry chat-entry--message">
      <UserAvatar className="chat-entry-avatar" size="xs" user={entry.message.author} />
      <div className="chat-entry-copy">
        <div className="chat-entry-meta">
          <span className="chat-entry-time">[{formatChatTimestamp(entry.createdAt)}]</span>
          <span className="chat-entry-name">{entry.message.author.display_name}</span>
        </div>
        <p className="chat-entry-body">{entry.message.body}</p>
      </div>
    </article>
  );
}

function createdAtToMillis(value: string) {
  const next = Date.parse(value);
  if (Number.isNaN(next)) {
    return 0;
  }
  return next;
}

function formatChatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPromptPartyName(value: string) {
  const next = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return next || "party";
}

function readableError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

function systemLabel(tone: SystemTone) {
  switch (tone) {
    case "error":
      return "error";
    case "help":
      return "help";
    case "success":
      return "ok";
    default:
      return "local";
  }
}
