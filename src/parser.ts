type ParsedRefs = {
  refs: { model: string; package?: string }[];
  sources: { source: string; table: string }[];
};

const stripJinjaComments = (sql: string) => sql.replace(/{#([\s\S]*?)#}/g, '');

export function parseDbtRefs(sql: string): ParsedRefs {
  const cleaned = stripJinjaComments(sql);

  const refs: ParsedRefs['refs'] = [];
  const sources: ParsedRefs['sources'] = [];

  // Matches ref('model') or ref("model") or ref('package','model')
  // We keep it intentionally permissive; macros/templating can still break.
  const refRe =
    /\bref\s*\(\s*(?:(['"])(?<a>[^'"]+)\1\s*,\s*)?(?:(['"])(?<b>[^'"]+)\3)\s*\)/g;
  for (const match of cleaned.matchAll(refRe)) {
    const a = match.groups?.a?.trim();
    const b = match.groups?.b?.trim();
    if (!b && !a) continue;
    if (b && a) refs.push({ package: a, model: b });
    else if (b) refs.push({ model: b });
    else if (a) refs.push({ model: a });
  }

  // Matches source('src','table')
  const sourceRe =
    /\bsource\s*\(\s*(['"])(?<src>[^'"]+)\1\s*,\s*(['"])(?<tbl>[^'"]+)\3\s*\)/g;
  for (const match of cleaned.matchAll(sourceRe)) {
    const src = match.groups?.src?.trim();
    const tbl = match.groups?.tbl?.trim();
    if (!src || !tbl) continue;
    sources.push({ source: src, table: tbl });
  }

  return { refs, sources };
}

