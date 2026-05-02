export type ParsedRef = {
  model: string;
  package?: string;
  version?: string;
};

export type ParsedSource = {
  source: string;
  table: string;
};

export type ParsedRefs = {
  refs: ParsedRef[];
  sources: ParsedSource[];
  metrics: string[];
};

export function parseDbtConfigMaterialization(sql: string): string | null {
  const cleaned = stripJinjaComments(sql);
  for (const argsText of extractFunctionCallArgs(cleaned, 'config')) {
    for (const rawArg of splitTopLevelCommaList(argsText)) {
      const keyword = rawArg.match(/^\s*materialized\s*=\s*(?<value>[\s\S]+)$/);
      if (keyword?.groups?.value !== undefined) {
        return literalStringValue(keyword.groups.value) ?? literalIdentifierValue(keyword.groups.value);
      }

      const objectValue = rawArg.match(/['"]materialized['"]\s*:\s*(?<value>['"][^'"]+['"]|[A-Za-z_][\w-]*)/);
      if (objectValue?.groups?.value !== undefined) {
        return literalStringValue(objectValue.groups.value) ?? literalIdentifierValue(objectValue.groups.value);
      }
    }
  }

  return null;
}

type MacroValueExpression =
  | { kind: 'literal'; value: string }
  | { kind: 'param'; name: string };

type MacroRefRule = {
  package?: MacroValueExpression;
  model: MacroValueExpression;
  version?: MacroValueExpression;
};

type MacroSourceRule = {
  source: MacroValueExpression;
  table: MacroValueExpression;
};

export type MacroDependencyRule = {
  params: string[];
  defaults: Map<string, string>;
  refs: MacroRefRule[];
  sources: MacroSourceRule[];
  metrics: MacroValueExpression[];
};

export type MacroDependencyRules = Map<string, MacroDependencyRule>;

const stripJinjaComments = (sql: string) => sql.replace(/{#([\s\S]*?)#}/g, '');

export function parseDbtRefs(sql: string, macroRules: MacroDependencyRules = new Map()): ParsedRefs {
  const cleaned = stripJinjaComments(sql);

  const refs: ParsedRefs['refs'] = [];
  const sources: ParsedRefs['sources'] = [];
  const metrics: ParsedRefs['metrics'] = [];
  const seenRefs = new Set<string>();
  const seenSources = new Set<string>();
  const seenMetrics = new Set<string>();

  function addRef(model: string, packageName?: string, version?: string) {
    const key = `${packageName ?? ''}:${model}:${version ?? ''}`;
    if (seenRefs.has(key)) return;
    seenRefs.add(key);
    refs.push({ ...(packageName ? { package: packageName } : {}), model, ...(version ? { version } : {}) });
  }

  function addSource(source: string, table: string) {
    const key = `${source}.${table}`;
    if (seenSources.has(key)) return;
    seenSources.add(key);
    sources.push({ source, table });
  }

  function addMetric(metric: string) {
    if (seenMetrics.has(metric)) return;
    seenMetrics.add(metric);
    metrics.push(metric);
  }

  for (const argsText of extractFunctionCallArgs(cleaned, 'ref')) {
    const ref = parseRefArgs(argsText);
    if (ref) addRef(ref.model, ref.package, ref.version);
  }

  for (const argsText of extractFunctionCallArgs(cleaned, 'source')) {
    const args = splitTopLevelCommaList(argsText).map((arg) => literalStringValue(arg));
    const source = args[0];
    const table = args[1];
    if (source && table) addSource(source, table);
  }

  for (const metric of parseMetricRefs(cleaned)) {
    addMetric(metric);
  }

  for (const [macroName, rule] of macroRules) {
    for (const argsText of extractFunctionCallArgs(cleaned, macroName)) {
      const argumentValues = bindCallArguments(rule.params, argsText, rule.defaults);
      for (const refRule of rule.refs) {
        const model = evaluateMacroExpression(refRule.model, argumentValues);
        if (!model) continue;
        const packageName = refRule.package ? (evaluateMacroExpression(refRule.package, argumentValues) ?? undefined) : undefined;
        const version = refRule.version ? (evaluateMacroExpression(refRule.version, argumentValues) ?? undefined) : undefined;
        addRef(model, packageName, version);
      }
      for (const sourceRule of rule.sources) {
        const source = evaluateMacroExpression(sourceRule.source, argumentValues);
        const table = evaluateMacroExpression(sourceRule.table, argumentValues);
        if (source && table) addSource(source, table);
      }
      for (const metricRule of rule.metrics) {
        const metric = evaluateMacroExpression(metricRule, argumentValues);
        if (metric) addMetric(metric);
      }
    }
  }

  return { refs, sources, metrics };
}

export function parseMacroDependencyRules(sql: string): MacroDependencyRules {
  const cleaned = stripJinjaComments(sql);
  const rules: MacroDependencyRules = new Map();
  const macroRe =
    /{%-?\s*macro\s+(?<name>[A-Za-z_][\w]*)\s*\((?<params>[\s\S]*?)\)\s*-?%}(?<body>[\s\S]*?){%-?\s*endmacro\s*-?%}/g;

  for (const match of cleaned.matchAll(macroRe)) {
    const name = match.groups?.name?.trim();
    const paramsText = match.groups?.params ?? '';
    const body = match.groups?.body ?? '';
    if (!name) continue;

    const parameters = splitTopLevelCommaList(paramsText)
      .map((param) => parseParameter(param))
      .filter((param): param is { name: string; defaultValue?: string } => Boolean(param));
    const params = parameters.map((param) => param.name);
    if (params.length === 0) continue;

    const defaults = new Map<string, string>();
    for (const parameter of parameters) {
      if (parameter.defaultValue !== undefined) defaults.set(parameter.name, parameter.defaultValue);
    }

    const paramSet = new Set(params);
    const refs = collectRefRules(body, paramSet);
    const sources = collectSourceRules(body, paramSet);
    const metrics = collectMetricRules(body, paramSet);
    if (refs.length === 0 && sources.length === 0 && metrics.length === 0) continue;

    rules.set(name, { params, defaults, refs, sources, metrics });
  }

  return rules;
}

export function mergeMacroDependencyRules(ruleSets: readonly MacroDependencyRules[]): MacroDependencyRules {
  const merged: MacroDependencyRules = new Map();
  for (const rules of ruleSets) {
    for (const [name, rule] of rules) {
      merged.set(name, rule);
    }
  }
  return merged;
}

function parseRefArgs(argsText: string): ParsedRef | null {
  const positional: string[] = [];
  const keywords = new Map<string, string>();

  for (const rawArg of splitTopLevelCommaList(argsText)) {
    const keyword = rawArg.match(/^\s*(?<name>[A-Za-z_][\w]*)\s*=\s*(?<value>[\s\S]+)$/);
    if (keyword?.groups?.name && keyword.groups.value !== undefined) {
      keywords.set(keyword.groups.name, keyword.groups.value.trim());
      continue;
    }

    const value = literalStringValue(rawArg);
    if (value) positional.push(value);
  }

  const version = literalScalarValue(keywords.get('version')) ?? literalScalarValue(keywords.get('v'));
  if (positional.length >= 2) return { package: positional[0], model: positional[1], ...(version ? { version } : {}) };
  if (positional.length === 1) return { model: positional[0], ...(version ? { version } : {}) };
  return null;
}

function collectRefRules(body: string, params: ReadonlySet<string>): MacroRefRule[] {
  const rules: MacroRefRule[] = [];

  for (const argsText of extractFunctionCallArgs(body, 'ref')) {
    const positional: MacroValueExpression[] = [];
    const keywords = new Map<string, MacroValueExpression>();

    for (const rawArg of splitTopLevelCommaList(argsText)) {
      const keyword = rawArg.match(/^\s*(?<name>[A-Za-z_][\w]*)\s*=\s*(?<value>[\s\S]+)$/);
      if (keyword?.groups?.name && keyword.groups.value !== undefined) {
        const expression = macroExpressionFromArgument(keyword.groups.value, params, true);
        if (expression) keywords.set(keyword.groups.name, expression);
        continue;
      }

      const expression = macroExpressionFromArgument(rawArg, params);
      if (expression) positional.push(expression);
    }

    const version = keywords.get('version') ?? keywords.get('v');
    if (positional.length >= 2) rules.push({ package: positional[0], model: positional[1], ...(version ? { version } : {}) });
    else if (positional.length === 1) rules.push({ model: positional[0], ...(version ? { version } : {}) });
  }

  return rules;
}

function collectSourceRules(body: string, params: ReadonlySet<string>): MacroSourceRule[] {
  const rules: MacroSourceRule[] = [];

  for (const argsText of extractFunctionCallArgs(body, 'source')) {
    const args = splitTopLevelCommaList(argsText)
      .map((arg) => macroExpressionFromArgument(arg, params))
      .filter((arg): arg is MacroValueExpression => Boolean(arg));
    if (args.length >= 2) rules.push({ source: args[0], table: args[1] });
  }

  return rules;
}

function collectMetricRules(body: string, params: ReadonlySet<string>): MacroValueExpression[] {
  const rules: MacroValueExpression[] = [];
  for (const functionName of ['metric', 'Metric']) {
    for (const argsText of extractFunctionCallArgs(body, functionName)) {
      const firstArg = splitTopLevelCommaList(argsText)[0];
      const expression = macroExpressionFromArgument(firstArg, params);
      if (expression) rules.push(expression);
    }
  }
  return rules;
}

function bindCallArguments(
  params: readonly string[],
  argsText: string,
  defaults: ReadonlyMap<string, string> = new Map()
): Map<string, string> {
  const values = new Map<string, string>(defaults);
  let positionalIndex = 0;

  for (const rawArg of splitTopLevelCommaList(argsText)) {
    const keyword = rawArg.match(/^\s*(?<name>[A-Za-z_][\w]*)\s*=\s*(?<value>[\s\S]+)$/);
    if (keyword?.groups?.name && keyword.groups.value !== undefined) {
      values.set(keyword.groups.name, keyword.groups.value.trim());
      continue;
    }

    const param = params[positionalIndex];
    positionalIndex += 1;
    if (param) values.set(param, rawArg.trim());
  }

  return values;
}

function evaluateMacroExpression(expression: MacroValueExpression, values: ReadonlyMap<string, string>): string | null {
  if (expression.kind === 'literal') return expression.value;
  return literalStringValue(values.get(expression.name)) ?? literalScalarValue(values.get(expression.name));
}

function macroExpressionFromArgument(
  rawArg: string | undefined,
  params: ReadonlySet<string>,
  allowScalar = false
): MacroValueExpression | null {
  if (!rawArg) return null;
  const trimmed = rawArg.trim();
  const literal = allowScalar ? literalScalarValue(trimmed) : literalStringValue(trimmed);
  if (literal) return { kind: 'literal', value: literal };
  return params.has(trimmed) ? { kind: 'param', name: trimmed } : null;
}

function parseMetricRefs(text: string): string[] {
  const metrics: string[] = [];
  for (const functionName of ['metric', 'Metric']) {
    for (const argsText of extractFunctionCallArgs(text, functionName)) {
      const metric = literalStringValue(splitTopLevelCommaList(argsText)[0]);
      if (metric) metrics.push(metric);
    }
  }
  return metrics;
}

function extractFunctionCallArgs(text: string, functionName: string): string[] {
  const calls: string[] = [];
  let searchFrom = 0;

  while (searchFrom < text.length) {
    const index = text.indexOf(functionName, searchFrom);
    if (index === -1) break;

    const before = index > 0 ? text[index - 1] : '';
    const afterName = text[index + functionName.length] ?? '';
    if (isIdentifierChar(before) || isIdentifierChar(afterName)) {
      searchFrom = index + functionName.length;
      continue;
    }

    let cursor = index + functionName.length;
    while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
    if (text[cursor] !== '(') {
      searchFrom = cursor;
      continue;
    }

    const end = findMatchingParen(text, cursor);
    if (end === -1) {
      searchFrom = cursor + 1;
      continue;
    }

    calls.push(text.slice(cursor + 1, end));
    searchFrom = end + 1;
  }

  return calls;
}

function findMatchingParen(text: string, openIndex: number): number {
  let depth = 0;
  let quote: string | null = null;

  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function splitTopLevelCommaList(value: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  const tail = value.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function parseParameter(param: string): { name: string; defaultValue?: string } | null {
  const match = param.trim().match(/^\*?(?<name>[A-Za-z_][\w]*)(?:\s*=\s*(?<defaultValue>[\s\S]+))?$/);
  if (!match?.groups?.name) return null;
  return {
    name: match.groups.name,
    ...(match.groups.defaultValue !== undefined ? { defaultValue: match.groups.defaultValue.trim() } : {})
  };
}

function literalStringValue(value?: string): string | null {
  if (!value) return null;
  const match = value.trim().match(/^(['"])(?<value>(?:\\.|(?!\1).)*)\1$/);
  return match?.groups?.value?.replace(/\\(['"\\])/g, '$1') ?? null;
}

function literalScalarValue(value?: string): string | null {
  if (!value) return null;
  const stringValue = literalStringValue(value);
  if (stringValue) return stringValue;
  const numericValue = value.trim().match(/^\d+$/);
  return numericValue ? numericValue[0] : null;
}

function literalIdentifierValue(value?: string): string | null {
  if (!value) return null;
  const identifier = value.trim().match(/^[A-Za-z_][\w-]*$/);
  return identifier ? identifier[0] : null;
}

function isIdentifierChar(value: string): boolean {
  return Boolean(value && /[A-Za-z0-9_]/.test(value));
}
