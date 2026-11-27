/**
 * A small arithmetic evaluator for ledger formulas: numbers, names,
 * + - * / and parentheses. Nothing else parses, and nothing is ever handed to
 * eval or Function.
 */

export class FormulaError extends Error {}

/** Thrown at evaluation, so a table can leave one cell empty and carry on. */
export class DivisionByZeroError extends FormulaError {}

type Node =
  | { type: 'number'; value: number }
  | { type: 'name'; name: string }
  | { type: 'negate'; operand: Node }
  | { type: 'binary'; op: '+' | '-' | '*' | '/'; left: Node; right: Node };

type Token =
  | { type: 'number'; value: number }
  | { type: 'name'; name: string }
  | { type: 'symbol'; symbol: '+' | '-' | '*' | '/' | '(' | ')' };

const TOKEN = /\s*(?:(\d+(?:\.\d+)?|\.\d+)|([A-Za-z_][A-Za-z0-9_]*)|([-+*/()]))/y;

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  TOKEN.lastIndex = 0;
  let position = 0;
  while (position < expr.length) {
    if (/^\s*$/.test(expr.slice(position))) break;
    TOKEN.lastIndex = position;
    const match = TOKEN.exec(expr);
    if (!match) {
      throw new FormulaError(
        `Cannot read "${expr.slice(position).trim()}" in the formula "${expr}". A formula takes numbers, names, + - * / and parentheses only.`
      );
    }
    if (match[1] !== undefined) tokens.push({ type: 'number', value: Number(match[1]) });
    else if (match[2] !== undefined) tokens.push({ type: 'name', name: match[2] });
    else tokens.push({ type: 'symbol', symbol: match[3] as '+' });
    position = TOKEN.lastIndex;
  }
  return tokens;
}

/** Parse a formula. Throws a FormulaError on anything that is not arithmetic. */
export function parseFormula(expr: string): Node {
  const tokens = tokenize(expr);
  let index = 0;

  const peekSymbol = () => {
    const token = tokens[index];
    return token?.type === 'symbol' ? token.symbol : null;
  };

  // expression = term (("+" | "-") term)*
  const expression = (): Node => {
    let left = term();
    for (let op = peekSymbol(); op === '+' || op === '-'; op = peekSymbol()) {
      index++;
      left = { type: 'binary', op, left, right: term() };
    }
    return left;
  };

  // term = factor (("*" | "/") factor)*
  const term = (): Node => {
    let left = factor();
    for (let op = peekSymbol(); op === '*' || op === '/'; op = peekSymbol()) {
      index++;
      left = { type: 'binary', op, left, right: factor() };
    }
    return left;
  };

  // factor = number | name | "-" factor | "(" expression ")"
  const factor = (): Node => {
    const token = tokens[index++];
    if (!token) throw new FormulaError(`The formula "${expr}" ends too soon.`);
    if (token.type === 'number') return { type: 'number', value: token.value };
    if (token.type === 'name') return { type: 'name', name: token.name };
    if (token.symbol === '-') return { type: 'negate', operand: factor() };
    if (token.symbol === '(') {
      const inner = expression();
      if (peekSymbol() !== ')') {
        throw new FormulaError(`The formula "${expr}" is missing a closing parenthesis.`);
      }
      index++;
      return inner;
    }
    throw new FormulaError(`Unexpected "${token.symbol}" in the formula "${expr}".`);
  };

  if (tokens.length === 0) throw new FormulaError('The formula is empty.');
  const tree = expression();
  if (index < tokens.length) {
    const extra = tokens[index];
    const shown =
      extra.type === 'number' ? extra.value : extra.type === 'name' ? extra.name : extra.symbol;
    throw new FormulaError(`Unexpected "${shown}" in the formula "${expr}".`);
  }
  return tree;
}

/** The names a parsed formula reads. */
export function formulaNames(node: Node, names = new Set<string>()): Set<string> {
  if (node.type === 'name') names.add(node.name);
  if (node.type === 'negate') formulaNames(node.operand, names);
  if (node.type === 'binary') {
    formulaNames(node.left, names);
    formulaNames(node.right, names);
  }
  return names;
}

export function evaluateParsed(node: Node, vars: Record<string, number>): number {
  switch (node.type) {
    case 'number':
      return node.value;
    case 'name': {
      if (!Object.hasOwn(vars, node.name)) {
        throw new FormulaError(`The formula uses "${node.name}", which has no value.`);
      }
      return vars[node.name];
    }
    case 'negate':
      return -evaluateParsed(node.operand, vars);
    case 'binary': {
      const left = evaluateParsed(node.left, vars);
      const right = evaluateParsed(node.right, vars);
      if (node.op === '+') return left + right;
      if (node.op === '-') return left - right;
      if (node.op === '*') return left * right;
      if (right === 0) throw new DivisionByZeroError('The formula divides by zero.');
      return left / right;
    }
  }
}

/**
 * Work out an arithmetic formula. Throws a FormulaError on anything that is
 * not numbers, names, + - * / and parentheses, on a name with no value, and
 * on division by zero.
 */
export function evaluateFormula(expr: string, vars: Record<string, number>): number {
  const value = evaluateParsed(parseFormula(expr), vars);
  if (!Number.isFinite(value)) {
    throw new FormulaError(`The formula "${expr}" does not give a finite number.`);
  }
  return value;
}
