export interface GamerpicOption {
  key: string;
  label: string;
  url: string;
}

type RawManifestItem =
  | string
  | {
      key?: string;
      label?: string;
      name?: string;
      filename?: string;
      file?: string;
      path?: string;
      src?: string;
      url?: string;
    };

type RawManifest =
  | RawManifestItem[]
  | {
      avatars?: RawManifestItem[];
      items?: RawManifestItem[];
      entries?: RawManifestItem[];
      gamerpics?: RawManifestItem[];
      files?: RawManifestItem[];
      manifest?: RawManifestItem[];
    };

const GAMERPIC_BASE_PATH = "/gamerpics/xbox-360-dashboard";

export function avatarUrlFromKey(key: string) {
  return `${GAMERPIC_BASE_PATH}/${key}.png`;
}

export async function fetchGamerpicOptions(): Promise<GamerpicOption[]> {
  const response = await fetch(`${GAMERPIC_BASE_PATH}/manifest.json`);
  if (!response.ok) {
    throw new Error(`failed to load gamerpic manifest (${response.status})`);
  }

  const manifest = (await response.json()) as RawManifest;
  return normalizeGamerpicManifest(manifest);
}

function normalizeGamerpicManifest(manifest: RawManifest): GamerpicOption[] {
  const items = Array.isArray(manifest)
    ? manifest
    : manifest.avatars
      ?? manifest.items
      ?? manifest.entries
      ?? manifest.gamerpics
      ?? manifest.files
      ?? manifest.manifest
      ?? [];

  return items.flatMap((item, index) => {
    if (typeof item === "string") {
      const key = fileStem(item);
      return [{
        key,
        label: prettifyLabel(key, index + 1),
        url: item.startsWith("/") ? item : avatarUrlFromKey(item),
      }];
    }

    const url = item.url ?? item.src ?? item.path ?? item.file ?? item.filename ?? "";
    const key = item.key ?? fileStem(url);
    if (!key || !url) {
      return [];
    }

    return [{
      key,
      label: item.label ?? item.name ?? prettifyLabel(key, index + 1),
      url: url.startsWith("/") || url.startsWith("http") ? url : avatarUrlFromKey(url),
    }];
  });
}

function fileStem(value: string) {
  const fileName = value.split("/").filter(Boolean).at(-1) ?? value;
  return fileName.replace(/\.[^.]+$/, "");
}

function prettifyLabel(key: string, index: number) {
  const formatted = key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();

  return formatted.length > 0 ? formatted : `Gamerpic ${index}`;
}
