export type MaterialSegment = "EF1" | "EF2" | "EM" | "PV";

export interface MaterialDetection {
  segment: MaterialSegment | null;
  label: string | null;
}

export function readDocumentFileName(doc: import("indesign").Document): string {
  try {
    const name = doc.name;
    if (name && typeof name === "string") {
      return name;
    }
  } catch {
    // ignore
  }

  try {
    const fullName = doc.fullName as unknown;
    if (typeof fullName === "string" && fullName) {
      const parts = fullName.replace(/\\/g, "/").split("/");
      return parts[parts.length - 1] || fullName;
    }
    if (fullName && typeof fullName === "object") {
      const file = fullName as { name?: string; fsName?: string; nativePath?: string };
      if (file.name) return file.name;
      const path = file.fsName || file.nativePath;
      if (path) {
        const parts = path.replace(/\\/g, "/").split("/");
        return parts[parts.length - 1] || path;
      }
    }
  } catch {
    // ignore
  }

  return "";
}

export function detectMaterialFromFileName(fileName: string): MaterialDetection {
  const normalized = (fileName || "").replace(/\.indd$/i, "");
  const upper = normalized.toUpperCase();

  // EFAI/EFAF costumam vir concatenados à marca (ex.: SciEFAF, SciEFAI).
  if (upper.includes("EFAI") || /\bEF1\b/i.test(normalized)) {
    return { segment: "EF1", label: "EF1/EFAI" };
  }
  if (upper.includes("EFAF") || /\bEF2\b/i.test(normalized)) {
    return { segment: "EF2", label: "EF2/EFAF" };
  }
  if (/(?:^|[^A-Z])EM(?:\d|[^A-Z]|$)/i.test(normalized)) {
    return { segment: "EM", label: "EM" };
  }
  if (/\bPV\b/i.test(normalized) || /\bPrevest\b/i.test(normalized)) {
    return { segment: "PV", label: "PV/Prevest" };
  }

  return { segment: null, label: null };
}
