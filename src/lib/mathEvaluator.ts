/**
 * Safe recursive-descent math expression evaluator.
 * Supports: + - * /  ( )  unary minus  float numbers
 *           functions: ROUND/REDONDEAR, FLOOR/ENTERO, CEIL/TECHO, ABS, SQRT/RAIZ,
 *                      MAX, MIN, SUM/SUMA, AVERAGE/PROMEDIO, PRODUCT/PRODUCTO,
 *                      POW/POTENCIA, LOG, LN, MOD/RESIDUO,
 *                      IF/SI (comparison: >, <, >=, <=, =, <>)
 * Does NOT use eval(). Safe for user-defined formulas.
 */

type TokenType = 'num' | 'op' | 'paren' | 'func' | 'comma' | 'cmp';
interface Token { type: TokenType; value: string; }

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }

    // Numbers
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) num += expr[i++];
      tokens.push({ type: 'num', value: num });
      continue;
    }

    // Function names (letters/underscore, then optional digits)
    if (/[A-Za-z_]/.test(ch)) {
      let name = '';
      while (i < expr.length && /[A-Za-z0-9_]/.test(expr[i])) name += expr[i++];
      tokens.push({ type: 'func', value: name });
      continue;
    }

    // Comparison operators (multi-char first)
    if (ch === '>' && expr[i+1] === '=') { tokens.push({ type: 'cmp', value: '>=' }); i += 2; continue; }
    if (ch === '<' && expr[i+1] === '=') { tokens.push({ type: 'cmp', value: '<=' }); i += 2; continue; }
    if (ch === '<' && expr[i+1] === '>') { tokens.push({ type: 'cmp', value: '<>' }); i += 2; continue; }
    if (ch === '>' || ch === '<')        { tokens.push({ type: 'cmp', value: ch });   i++;    continue; }
    if (ch === '=' && expr[i+1] !== '=') { tokens.push({ type: 'cmp', value: '=' });  i++;    continue; }

    if (['+', '-', '*', '/'].includes(ch)) { tokens.push({ type: 'op', value: ch }); i++; continue; }
    if (ch === '(' || ch === ')')          { tokens.push({ type: 'paren', value: ch }); i++; continue; }
    if (ch === ',')                        { tokens.push({ type: 'comma', value: ',' }); i++; continue; }

    throw new Error(`Carácter no permitido: "${ch}"`);
  }
  return tokens;
}

export interface EvalResult {
  ok: boolean;
  value: number;
  error?: string;
}

function applyFunction(name: string, args: number[]): number {
  const n = name.toUpperCase();
  const a0 = args[0] ?? 0;
  const a1 = args[1] ?? 0;
  switch (n) {
    case 'ROUND': case 'REDONDEAR': {
      const decimals = Math.max(0, Math.round(a1));
      const factor = Math.pow(10, decimals);
      return Math.round(a0 * factor) / factor;
    }
    case 'FLOOR': case 'ENTERO':   return Math.floor(a0);
    case 'CEIL':  case 'TECHO':    return Math.ceil(a0);
    case 'ABS':                    return Math.abs(a0);
    case 'SQRT':  case 'RAIZ':     return a0 >= 0 ? Math.sqrt(a0) : 0;
    case 'POW':   case 'POTENCIA': return Math.pow(a0, a1);
    case 'LOG':                    return a0 > 0 ? Math.log10(a0) : 0;
    case 'LN':                     return a0 > 0 ? Math.log(a0) : 0;
    case 'MOD':   case 'RESIDUO':  return a1 !== 0 ? a0 % a1 : 0;
    case 'MAX':                    return args.length > 0 ? Math.max(...args) : 0;
    case 'MIN':                    return args.length > 0 ? Math.min(...args) : 0;
    case 'SUM':   case 'SUMA':     return args.reduce((s, v) => s + v, 0);
    case 'AVERAGE': case 'PROMEDIO':
      return args.length > 0 ? args.reduce((s, v) => s + v, 0) / args.length : 0;
    case 'PRODUCT': case 'PRODUCTO':
      return args.reduce((s, v) => s * v, 1);
    case 'IF': case 'SI': {
      // SI(condition, val_if_true, val_if_false)
      // condition is 1 (true) or 0 (false) — use comparison operators
      const [cond, valTrue, valFalse = 0] = args;
      return cond !== 0 ? valTrue : valFalse;
    }
    case 'TRUNCAR': case 'TRUNC':  return Math.trunc(a0);
    case 'SIGNO':   case 'SIGN':   return a0 > 0 ? 1 : a0 < 0 ? -1 : 0;
    case 'PI':                     return Math.PI;
    default: throw new Error(`Función no reconocida: "${name}". Disponibles: REDONDEAR, ENTERO, TECHO, ABS, RAIZ, MAX, MIN, SUMA, PROMEDIO, PRODUCTO, POTENCIA, LOG, LN, MOD, SI`);
  }
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
  function consume(): Token { const t = tokens[pos++]; if (!t) throw new Error('Expresión incompleta'); return t; }

  // Grammar (lowest to highest precedence):
  // comparison: expr (> | < | >= | <= | = | <>) expr  → 0 or 1
  // expr:       term (+ | -) term
  // term:       factor (* | /) factor
  // factor:     num | (comparison) | func(...) | -factor

  function parseComparison(): number {
    const left = parseExpr();
    const t = peek();
    if (t?.type === 'cmp') {
      consume();
      const right = parseExpr();
      switch (t.value) {
        case '>':  return left > right  ? 1 : 0;
        case '<':  return left < right  ? 1 : 0;
        case '>=': return left >= right ? 1 : 0;
        case '<=': return left <= right ? 1 : 0;
        case '=':  return left === right ? 1 : 0;
        case '<>': return left !== right ? 1 : 0;
        default:   return 0;
      }
    }
    return left;
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
        if (right === 0) return 0; // division by zero → 0 (not error)
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

    // Unary minus
    if (t.value === '-') { consume(); return -parseFactor(); }

    // Number literal
    if (t.type === 'num') {
      consume();
      const v = parseFloat(t.value);
      if (isNaN(v)) throw new Error(`Número inválido: ${t.value}`);
      return v;
    }

    // Parenthesized expression
    if (t.value === '(') {
      consume();
      const val = parseComparison();
      if (!peek() || peek()!.value !== ')') throw new Error('Paréntesis sin cerrar');
      consume();
      return val;
    }

    // Function call: FNAME(arg1, arg2, ...)
    if (t.type === 'func') {
      const fname = consume().value;
      // PI() takes no args and the parentheses are optional
      if (fname.toUpperCase() === 'PI') {
        if (peek()?.value === '(') { consume(); if (peek()?.value === ')') consume(); }
        return Math.PI;
      }
      if (!peek() || peek()!.value !== '(') {
        throw new Error(`Se esperaba '(' después de ${fname}()`);
      }
      consume(); // consume '('
      const args: number[] = [];
      if (peek()?.value !== ')') {
        args.push(parseComparison());
        while (peek()?.type === 'comma') { consume(); args.push(parseComparison()); }
      }
      if (!peek() || peek()!.value !== ')') throw new Error(`Se esperaba ')' para cerrar ${fname}()`);
      consume(); // consume ')'
      return applyFunction(fname, args);
    }

    throw new Error(`Token inesperado: "${t.value}"`);
  }

  try {
    const result = parseComparison();
    if (pos !== tokens.length) {
      return { ok: false, value: 0, error: 'Expresión inválida: hay caracteres extra al final' };
    }
    if (!isFinite(result)) {
      return { ok: true, value: 0 }; // Infinity/NaN → 0, not an error
    }
    return { ok: true, value: result };
  } catch (e) {
    return { ok: false, value: 0, error: (e as Error).message };
  }
}

/**
 * Replace all {TOKEN_KEY} placeholders with their numeric values.
 */
export function resolveTokens(
  expression: string,
  varMap: Record<string, number>,
): { resolved: string; unknowns: string[] } {
  const unknowns: string[] = [];
  const resolved = expression.replace(/\{([^}]+)\}/g, (_, key) => {
    if (key in varMap) return String(varMap[key]);
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
  if (!expression?.trim()) return { ok: false, value: 0, error: 'La expresión está vacía' };
  const { resolved, unknowns } = resolveTokens(expression, varMap);
  const result = evaluateExpression(resolved);
  return { ...result, unknowns: unknowns.length > 0 ? unknowns : undefined };
}

/**
 * Validate an expression string (with token placeholders) without evaluating.
 */
export function validateExpression(expression: string): string | null {
  if (!expression?.trim()) return 'La expresión no puede estar vacía';
  let depth = 0;
  for (const ch of expression) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth < 0) return 'Hay un paréntesis de cierre sin su apertura correspondiente';
  }
  if (depth !== 0) return `Hay ${depth} paréntesis sin cerrar`;
  const preview = expression.replace(/\{([^}]+)\}/g, '1');
  const result = evaluateExpression(preview);
  if (!result.ok) return result.error ?? 'Expresión inválida';
  return null;
}
