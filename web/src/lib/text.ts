/** Lowercase and strip diacritics so "Fërgesë" matches "fergese" and "Çaj" matches "caj". */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function foodSearchText(name: string, brand?: string | null, localNames?: Record<string, string | undefined> | null) {
  return normalize([name, brand ?? "", ...Object.values(localNames ?? {}).filter(Boolean)].join(" "));
}
