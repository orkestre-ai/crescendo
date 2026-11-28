import sanitizeHtml from 'sanitize-html';

/**
 * What a rendered block may contain: text, tables and drawings. No script,
 * style, iframe, object or foreignObject; no style attribute and no on*
 * attribute (neither is on the list); links to https: and mailto: only.
 */

const TEXT_TAGS = [
  'header',
  'footer',
  'div',
  'span',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'b',
  'strong',
  'i',
  'em',
  'small',
  'sup',
  'sub',
  'abbr',
  'time',
  'code',
  'br',
  'hr',
  'a',
  'blockquote',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'figure',
  'figcaption',
  'details',
  'summary',
];

const TABLE_TAGS = [
  'table',
  'caption',
  'colgroup',
  'col',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
];

const SVG_TAGS = [
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'title',
  'desc',
];

const GLOBAL_ATTRIBUTES = ['class', 'id', 'role', 'tabindex', 'lang', 'dir', 'aria-*', 'data-*'];

const SVG_ATTRIBUTES = [
  'viewBox',
  'preserveAspectRatio',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'x2',
  'y1',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'dx',
  'dy',
  'd',
  'points',
  'transform',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'text-anchor',
  'dominant-baseline',
  'focusable',
];

// The same parser for both passes below, so they differ only in what is allowed.
// Names keep their case (viewBox, not viewbox), and <rect /> closes itself.
const PARSER = {
  lowerCaseTags: false,
  lowerCaseAttributeNames: false,
  recognizeSelfClosing: true,
  decodeEntities: true,
};

const POLICY: sanitizeHtml.IOptions = {
  allowedTags: [...TEXT_TAGS, ...TABLE_TAGS, ...SVG_TAGS],
  allowedAttributes: {
    '*': GLOBAL_ATTRIBUTES,
    a: ['href'],
    time: ['datetime'],
    details: ['open'],
    ol: ['start'],
    col: ['span'],
    th: ['colspan', 'rowspan', 'scope'],
    td: ['colspan', 'rowspan'],
    ...Object.fromEntries(SVG_TAGS.map((tag) => [tag, SVG_ATTRIBUTES])),
  },
  allowedSchemes: ['https', 'mailto'],
  allowProtocolRelative: false,
  // A link with no scheme would open a page of the app inside the report.
  transformTags: {
    a: (tagName, attribs) => {
      const next = { ...attribs };
      if (next.href !== undefined && !/^(https:|mailto:)/i.test(next.href.trim())) delete next.href;
      return { tagName, attribs: next };
    },
  },
  disallowedTagsMode: 'discard',
  parser: PARSER,
};

// Everything allowed: the same text through the same parser and writer,
// with nothing taken out.
const PASS_THROUGH: sanitizeHtml.IOptions = {
  allowedTags: false,
  allowedAttributes: false,
  allowVulnerableTags: true,
  allowedSchemesAppliedToAttributes: [],
  parser: PARSER,
};

/**
 * Sanitise a rendered block. `changed` is true when the sanitiser took
 * something out: a tag, an attribute or a link it does not allow.
 */
export function sanitizeBlockHtml(html: string): { html: string; changed: boolean } {
  const safe = sanitizeHtml(html, POLICY);
  return { html: safe, changed: safe !== sanitizeHtml(html, PASS_THROUGH) };
}
