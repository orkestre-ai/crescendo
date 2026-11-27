import postcss from 'postcss';
import { TOKEN_NAMES } from '../design/tokens';
import { BLOCK_KEY, parseTemplate, renderBlock, renderRaw } from './engine';
import { datasetRef, figureRef, FIGURE_TOKEN, resolveBlockData } from './resolve';
import { sanitizeBlockHtml } from './sanitize';
import type { BlockIssue, BlockSeed, JSONSchema, Ledger } from './types';

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// ── The data shape ─────────────────────────────────────────────────────────

const SCHEMA_KEYWORDS = new Set([
  'type',
  'description',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'minItems',
  'maxItems',
  'enum',
  'x-ref',
  'x-editable',
]);
const SCHEMA_TYPES = new Set(['object', 'array', 'string', 'boolean']);

/**
 * The rules of a data shape. The one that matters most: no number type
 * anywhere. A number reaches a block only through a ledger reference, which
 * is what stops a typed number appearing in a tile, a table or a chart.
 */
function checkSchema(schema: unknown, path: string, issues: BlockIssue[]): void {
  if (!isPlainObject(schema)) {
    issues.push({ rule: 'schema', path, message: 'A data shape must be an object.' });
    return;
  }
  for (const keyword of Object.keys(schema)) {
    if (!SCHEMA_KEYWORDS.has(keyword)) {
      issues.push({
        rule: 'schema-keyword',
        path,
        message: `"${keyword}" is not allowed in a data shape. Allowed: ${[...SCHEMA_KEYWORDS].join(', ')}.`,
      });
    }
  }

  const ref = schema['x-ref'];
  if (ref !== undefined) {
    if (ref !== 'figure' && ref !== 'dataset') {
      issues.push({ rule: 'schema-ref', path, message: '"x-ref" is "figure" or "dataset".' });
    }
    if (schema.type !== undefined || schema.properties !== undefined) {
      issues.push({
        rule: 'schema-ref',
        path,
        message: 'A reference slot has "x-ref" and a description, and no type of its own.',
      });
    }
    return;
  }

  const type = schema.type;
  if (type === 'number' || type === 'integer') {
    issues.push({
      rule: 'schema-number',
      path,
      message: `A data shape may not take a ${type}. A number comes from the ledger: use { "x-ref": "figure" } for one value or { "x-ref": "dataset" } for a table.`,
    });
    return;
  }
  if (typeof type !== 'string' || !SCHEMA_TYPES.has(type)) {
    issues.push({
      rule: 'schema-type',
      path,
      message: `Every part of a data shape needs a type: ${[...SCHEMA_TYPES].join(', ')}, or an "x-ref".`,
    });
    return;
  }
  if (schema['x-editable'] !== undefined && type !== 'string') {
    issues.push({ rule: 'schema-editable', path, message: 'Only text can be "x-editable".' });
  }
  if (schema.enum !== undefined) {
    const values = schema.enum;
    if (type !== 'string' || !Array.isArray(values) || values.some((v) => typeof v !== 'string')) {
      issues.push({ rule: 'schema-enum', path, message: 'An "enum" is a list of text values.' });
    }
  }

  if (type === 'object') {
    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    for (const [name, child] of Object.entries(properties)) {
      if (name === 'figure' || name === 'dataset') {
        issues.push({
          rule: 'schema-reserved',
          path: `${path}/${name}`,
          message: `"${name}" is the name of a ledger reference and cannot be a field.`,
        });
      }
      checkSchema(child, `${path}/${name}`, issues);
    }
    const required = schema.required;
    if (required !== undefined) {
      if (!Array.isArray(required) || required.some((name) => !(String(name) in properties))) {
        issues.push({
          rule: 'schema-required',
          path,
          message: '"required" lists fields that "properties" defines.',
        });
      }
    }
  }
  if (type === 'array') {
    if (schema.items === undefined) {
      issues.push({ rule: 'schema-items', path, message: 'A list needs "items".' });
    } else checkSchema(schema.items, `${path}/items`, issues);
  }
}

/**
 * Check data against a shape. With `ledger`, reference slots hold
 * references and must name something in the ledger; without it the data is
 * a sample, whose slots already hold what a reference resolves to.
 */
function checkData(
  schema: JSONSchema,
  value: unknown,
  path: string,
  ledger: Ledger | null,
  issues: BlockIssue[]
): void {
  const at = path || 'the data';

  if (schema['x-ref'] === 'figure') {
    if (!ledger) {
      if (!isPlainObject(value) || typeof value.display !== 'string') {
        issues.push({ rule: 'sample-data', path, message: `${at} must be a resolved figure.` });
      }
      return;
    }
    const key = figureRef(value);
    if (key === null) {
      issues.push({
        rule: 'figure-ref',
        path,
        message: `${at} takes a figure from the ledger: { "figure": "<key>" }. A number cannot be typed here.`,
      });
    } else if (!ledger.figures.some((figure) => figure.key === key)) {
      issues.push({
        rule: 'figure-missing',
        path,
        message: `${at}: there is no figure "${key}". Recorded figures: ${listKeys(ledger.figures)}.`,
      });
    }
    return;
  }
  if (schema['x-ref'] === 'dataset') {
    if (!ledger) {
      if (!isPlainObject(value) || !Array.isArray(value.columns) || !Array.isArray(value.rows)) {
        issues.push({ rule: 'sample-data', path, message: `${at} must be a resolved table.` });
      }
      return;
    }
    const key = datasetRef(value);
    if (key === null) {
      issues.push({
        rule: 'dataset-ref',
        path,
        message: `${at} takes a table from the ledger: { "dataset": "<key>" }.`,
      });
    } else if (!ledger.datasets.some((dataset) => dataset.key === key)) {
      issues.push({
        rule: 'dataset-missing',
        path,
        message: `${at}: there is no dataset "${key}". Defined datasets: ${listKeys(ledger.datasets)}.`,
      });
    }
    return;
  }

  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') {
        issues.push({ rule: 'data-type', path, message: `${at} must be text.` });
      } else if (schema.enum && !schema.enum.includes(value)) {
        issues.push({
          rule: 'data-enum',
          path,
          message: `${at} must be one of: ${schema.enum.join(', ')}.`,
        });
      } else if (ledger) {
        for (const match of value.matchAll(FIGURE_TOKEN)) {
          if (!ledger.figures.some((figure) => figure.key === match[1])) {
            issues.push({
              rule: 'figure-missing',
              path,
              message: `${at} uses {{fig:${match[1]}}}, but there is no figure "${match[1]}". Recorded figures: ${listKeys(ledger.figures)}.`,
            });
          }
        }
      }
      return;
    case 'boolean':
      if (typeof value !== 'boolean') {
        issues.push({ rule: 'data-type', path, message: `${at} must be true or false.` });
      }
      return;
    case 'array': {
      if (!Array.isArray(value)) {
        issues.push({ rule: 'data-type', path, message: `${at} must be a list.` });
        return;
      }
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        issues.push({
          rule: 'data-items',
          path,
          message: `${at} needs at least ${schema.minItems} item(s).`,
        });
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        issues.push({
          rule: 'data-items',
          path,
          message: `${at} takes at most ${schema.maxItems} item(s).`,
        });
      }
      if (schema.items) {
        value.forEach((item, i) => checkData(schema.items!, item, `${path}/${i}`, ledger, issues));
      }
      return;
    }
    default: {
      if (!isPlainObject(value)) {
        issues.push({ rule: 'data-type', path, message: `${at} must be an object.` });
        return;
      }
      const properties = schema.properties ?? {};
      for (const name of schema.required ?? []) {
        if (value[name] === undefined) {
          issues.push({
            rule: 'data-required',
            path: `${path}/${name}`,
            message: `${path}/${name} is missing.`,
          });
        }
      }
      for (const [name, child] of Object.entries(value)) {
        if (properties[name]) checkData(properties[name], child, `${path}/${name}`, ledger, issues);
        else if (schema.additionalProperties === false) {
          issues.push({
            rule: 'data-unknown',
            path: `${path}/${name}`,
            message: `${path}/${name} is not a field of this block. Its fields: ${Object.keys(properties).join(', ')}.`,
          });
        }
      }
    }
  }
}

function listKeys(items: { key: string }[]): string {
  if (items.length === 0) return 'none yet';
  const keys = items.slice(0, 40).map((item) => item.key);
  return keys.join(', ') + (items.length > 40 ? `, and ${items.length - 40} more` : '');
}

// ── Styles ─────────────────────────────────────────────────────────────────

// prettier-ignore
const NAMED_COLOURS = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen canvas canvastext linktext visitedtext activetext buttonface buttontext buttonborder field fieldtext highlight highlighttext selecteditem selecteditemtext mark marktext graytext accentcolor accentcolortext').split(' '));

const COLOUR_FUNCTION =
  /\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark|device-cmyk)\s*\(/i;
const HEX_COLOUR = /#[0-9a-f]{3,8}\b/i;
const VAR = /var\(\s*--([A-Za-z0-9_-]+)\s*\)/g;

/**
 * The rules of a block's styles: every selector starts with the block's own
 * class, nothing is loaded, nothing is pinned to the window, the fonts are
 * the report's, and every colour is a design token.
 */
export function validateBlockCss(key: string, css: string): BlockIssue[] {
  const issues: BlockIssue[] = [];
  if (css.includes('<')) {
    issues.push({ rule: 'css-markup', message: 'Styles may not contain "<".' });
    return issues;
  }
  let root: postcss.Root;
  try {
    root = postcss.parse(css);
  } catch (err) {
    return [{ rule: 'css-parse', message: `The styles do not parse: ${errorMessage(err)}` }];
  }

  const own = new RegExp(`^\\.blk-${key}(?![A-Za-z0-9_-])`);
  const local = new Set<string>();
  root.walkDecls((decl) => {
    if (decl.prop.startsWith('--')) local.add(decl.prop.slice(2));
  });

  root.walkAtRules((rule) => {
    const name = rule.name.toLowerCase();
    if (name === 'import') {
      issues.push({ rule: 'css-import', message: '@import is not allowed: nothing is loaded.' });
    } else if (name !== 'media' && name !== 'supports' && name !== 'container') {
      issues.push({
        rule: 'css-at-rule',
        message: `@${rule.name} is not allowed. Only @media, @container and @supports are.`,
      });
    }
  });

  root.walkRules((rule) => {
    for (const selector of rule.selectors) {
      if (!own.test(selector.trim())) {
        issues.push({
          rule: 'css-selector',
          message: `The selector "${selector.trim()}" must start with .blk-${key}, so the styles touch this block only.`,
        });
      }
    }
  });

  root.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    const value = decl.value;
    const where = `${decl.prop}: ${value}`;
    if (/url\s*\(/i.test(value) || /image-set\s*\(/i.test(value)) {
      issues.push({ rule: 'css-url', message: `url( is not allowed (${where}).` });
    }
    if (prop === 'position' && /\bfixed\b/i.test(value)) {
      issues.push({ rule: 'css-position', message: 'position: fixed is not allowed.' });
    }
    if (prop === 'font-family' || prop === 'font') {
      issues.push({
        rule: 'css-font',
        message: `${decl.prop} is not allowed: the report sets the typefaces. Use font-size and font-weight.`,
      });
    }

    for (const match of value.matchAll(VAR)) {
      if (!TOKEN_NAMES.has(match[1]) && !local.has(match[1])) {
        issues.push({
          rule: 'css-token',
          message: `var(--${match[1]}) is not a design token (${where}).`,
        });
      }
    }
    // What is left once tokens and quoted text are taken out must hold no colour.
    const rest = value
      .replace(VAR, ' ')
      .replace(/"[^"]*"|'[^']*'/g, ' ')
      .toLowerCase();
    const named = rest.split(/[^a-z-]+/).find((word) => NAMED_COLOURS.has(word));
    if (HEX_COLOUR.test(rest) || COLOUR_FUNCTION.test(rest) || named) {
      issues.push({
        rule: 'css-colour',
        message: `Every colour must be a design token such as var(--text), or currentColor or transparent (${where}).`,
      });
    }
  });

  return issues;
}

// A drawing may colour itself only through a token, or leave it to the styles.
const COLOUR_ATTRIBUTE = /\s(fill|stroke|color|stop-color)="([^"]*)"/g;
const TOKEN_COLOUR = /^(none|currentColor|transparent|inherit|var\(--([A-Za-z0-9_-]+)\))$/;

function checkColourAttributes(html: string, issues: BlockIssue[]): void {
  for (const match of html.matchAll(COLOUR_ATTRIBUTE)) {
    const token = TOKEN_COLOUR.exec(match[2].trim());
    if (!token || (token[2] !== undefined && !TOKEN_NAMES.has(token[2]))) {
      issues.push({
        rule: 'html-colour',
        message: `${match[1]}="${match[2]}" is not a design token. Use a class and colour it in the styles, or a token such as var(--s1).`,
      });
    }
  }
}

// ── A whole definition ─────────────────────────────────────────────────────

/**
 * Everything a block must pass before it may be saved: its data shape, its
 * template, its styles, and a render of its own sample data that the
 * sanitiser leaves untouched. An empty list means the block is sound.
 */
export function validateBlockDef(def: BlockSeed): BlockIssue[] {
  const issues: BlockIssue[] = [];

  if (!BLOCK_KEY.test(def.key)) {
    issues.push({
      rule: 'key',
      message: `"${def.key}" cannot be a block key. Use lower-case letters, digits and underscores, starting with a letter.`,
    });
    return issues;
  }
  if (!def.name?.trim() || !def.description?.trim()) {
    issues.push({ rule: 'name', message: 'A block needs a name and a description.' });
  }

  const schemaIssues: BlockIssue[] = [];
  checkSchema(def.dataSchema, '', schemaIssues);
  if (isPlainObject(def.dataSchema) && def.dataSchema.type !== 'object') {
    schemaIssues.push({ rule: 'schema-type', message: 'A data shape starts with an object.' });
  }
  issues.push(...schemaIssues);

  issues.push(...validateBlockCss(def.key, def.css ?? ''));

  try {
    parseTemplate(def.template);
  } catch (err) {
    issues.push({
      rule: 'template-parse',
      message: `The template does not parse: ${errorMessage(err)}`,
    });
    return issues;
  }

  if (schemaIssues.length === 0) {
    checkData(def.dataSchema, def.sampleData, '', null, issues);
  }
  for (const mode of ['screen', 'print'] as const) {
    let raw: string;
    try {
      raw = renderRaw(def, def.sampleData, { mode });
    } catch (err) {
      issues.push({
        rule: 'render',
        message: `The block does not render with its sample data (${mode}): ${errorMessage(err)}`,
      });
      break;
    }
    const { html, changed } = sanitizeBlockHtml(raw);
    if (changed) {
      issues.push({
        rule: 'sanitiser',
        message: `The template writes something a report may not contain (${mode}): a tag, an attribute or a link that is not allowed. No script, style, iframe, object or foreignObject; no style or on* attributes; links to https: and mailto: only.`,
      });
      break;
    }
    if (!html.trim()) {
      issues.push({ rule: 'render', message: `The block renders nothing (${mode}).` });
      break;
    }
    const before = issues.length;
    checkColourAttributes(html, issues);
    if (issues.length > before) break;
  }

  return issues;
}

/**
 * Check the data for one block of a report: it fits the block's shape, every
 * reference names something in the ledger, and the block draws. An empty
 * list means it can be placed.
 */
export function validateBlockData(def: BlockSeed, data: unknown, ledger: Ledger): BlockIssue[] {
  const issues: BlockIssue[] = [];
  checkData(def.dataSchema, data, '', ledger, issues);
  if (issues.length > 0) return issues;
  try {
    renderBlock(def, resolveBlockData(data, ledger), {
      mode: 'screen',
      currencyCode: ledger.currencyCode,
    });
  } catch (err) {
    issues.push({ rule: 'render', message: errorMessage(err) });
  }
  return issues;
}
