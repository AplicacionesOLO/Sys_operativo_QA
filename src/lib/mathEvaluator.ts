/**
 * Safe recursive-descent math expression evaluator.
 * Supports: +  -  *  /  (  )  unary minus  float numbers
 * Does NOT use eval(). Safe for user-defined formulas.
 */

interface Token {
  type: 'num' | 'op' | 'paren';
  value: string;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) num += expr[i++];
      tokens.push({ type: 'num', value: num });
    } else if (['+', '-', '*', '/'].includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
    } else if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i++;
    } else {
      throw new Error(`Carácter no permitido: "${ch}"`);
    }
  }
  return tokens;
}

export interface EvalResult {
  ok: boolean;
  value: number;
  error?: string;
}

export function evaluateExpression(expr: string): EvalResult {
  let tokens: Token[];
  try {
    tokens = tokenize(expr.trim());
  } catch (e) {
    return { ok: false, value: 0, error: (e as Error).message };
  }

  if (tokens.length === 0) {
    return { ok: false, value: 0, error: 'La expresión está vacía' };
  }

  let pos = 0;

  function peek(): Token | undefined { return tokens[pos]; }

  function consume(): Token {
    const t = tokens[pos++];
    if (!t) throw new Error('Expresión incompleta');
    return t;
  }

  function parseExpr(): number {
    let left = parseTerm();
    while (peek()?.value === '+' || peek()?.value === '-') {
      const op = consume().value;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (peek()?.value === '*' || peek()?.value === '/') {
      const op = consume().value;
      const right = parseFactor();
      if (op === '/') {
        if (right === 0) throw new Error('División entre cero');
        left = left / right;
      } else {
        left = left * right;
      }
    }
    return left;
  }

  function parseFactor(): number {
    const t = peek();
    if (!t) throw new Error('Expresión incompleta: se esperaba un valor');

    if (t.value === '-') {
      consume();
      return -parseFactor();
    }

    if (t.type === 'num') {
      consume();
      const v = parseFloat(t.value);
      if (isNaN(v)) throw new Error(`Número inválido: ${t.value}`);
      return v;
    }

    if (t.value === '(') {
      consume();
      const val = parseExpr();
      const closing = peek();
      if (!closing || closing.value !== ')') throw new Error('Paréntesis sin cerrar');
      consume();
      return val;
    }

    throw new Error(`Token inesperado: "${t.value}"`);
  }

  try {
    const result = parseExpr();
    if (pos !== tokens.length) {
      return { ok: false, value: 0, error: 'Expresión inválida: hay caracteres extra al final' };
    }
    if (!isFinite(result)) {
      return { ok: false, value: 0, error: 'El resultado no es un número finito' };
    }
    return { ok: true, value: result };
  } catch (e) {
    return { ok: false, value: 0, error: (e as Error).message };
  }
}

/**
 * Replace all {TOKEN_KEY} placeholders in an expression with their numeric values.
 * Returns the resulting numeric expression string ready for evaluateExpression().
 */
export function resolveTokens(
  expression: string,
  varMap: Record<string, number>,
): { resolved: string; unknowns: string[] } {
  const unknowns: string[] = [];
  const resolved = expression.replace(/\{([^}]+)\}/g, (_, key) => {
    if (key in varMap) {
      return String(varMap[key]);
    }
    unknowns.push(key);
    return '0';
  });
  return { resolved, unknowns };
}

/**
 * Full evaluate: resolve tokens then evaluate math.
 */
export function evalFormula(
  expression: string,
  varMap: Record<string, number>,
): EvalResult & { unknowns?: string[] } {
  if (!expression?.trim()) {
    return { ok: false, value: 0, error: 'La expresión está vacía' };
  }
  const { resolved, unknowns } = resolveTokens(expression, varMap);
  const result = evaluateExpression(resolved);
  return { ...result, unknowns: unknowns.length > 0 ? unknowns : undefined };
}

/**
 * Validate an expression string (with token placeholders) without evaluating.
 * Catches syntax errors and unbalanced parentheses.
 */
export function validateExpression(expression: string): string | null {
  if (!expression?.trim()) return 'La expresión no puede estar vacía';

  // Check balanced parentheses
  let depth = 0;
  for (const ch of expression) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth < 0) return 'Hay un paréntesis de cierre sin su apertura correspondiente';
  }
  if (depth !== 0) return `Hay ${depth} paréntesis sin cerrar`;

  // Replace tokens with 1 so we can validate math syntax
  const preview = expression.replace(/\{([^}]+)\}/g, '1');
  const result = evaluateExpression(preview);
  if (!result.ok) return result.error ?? 'Expresión inválida';

  return null;
}
