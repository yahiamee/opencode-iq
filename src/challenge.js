import { randomInt, randomUUID } from "node:crypto";
import { sourceFingerprint } from "./scan.js";

const operators = {
  "+": (a, b) => a + b,
  "-": (a, b) => a - b,
  "*": (a, b) => a * b,
  "/": (a, b) => a / b,
  "%": (a, b) => a % b,
  "<": (a, b) => a < b,
  "<=": (a, b) => a <= b,
  ">": (a, b) => a > b,
  ">=": (a, b) => a >= b,
  "===": (a, b) => a === b,
  "!==": (a, b) => a !== b,
};

function expression(ts, node, parameters, depth = 0) {
  if (depth > 30) throw new Error("Expression exceeds the challenge complexity limit");
  const child = (part) => expression(ts, part, parameters, depth + 1);
  if (ts.isNumericLiteral(node)) {
    const value = Number(node.text);
    if (Number.isFinite(value)) return () => value;
  }
  if (ts.isIdentifier(node) && parameters.includes(node.text)) return (inputs) => inputs[parameters.indexOf(node.text)];
  if (ts.isParenthesizedExpression(node)) return child(node.expression);
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    const operand = child(node.operand);
    return (inputs) => -operand(inputs);
  }
  if (ts.isConditionalExpression(node)) {
    const condition = child(node.condition);
    const yes = child(node.whenTrue);
    const no = child(node.whenFalse);
    return (inputs) => condition(inputs) ? yes(inputs) : no(inputs);
  }
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.getText();
    if (Object.hasOwn(operators, operator)) {
      const left = child(node.left);
      const right = child(node.right);
      return (inputs) => operators[operator](left(inputs), right(inputs));
    }
  }
  throw new Error("Challenge expressions support numeric inputs, arithmetic, comparisons and conditionals");
}

function compile(ts, declaration) {
  if (!ts.isFunctionDeclaration(declaration) || !declaration.body || declaration.asteriskToken ||
      declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) ||
      declaration.parameters.length < 1 || declaration.parameters.length > 2) throw new Error("Expected a synchronous function with one or two parameters");
  const parameters = declaration.parameters.map((parameter) => {
    if (!ts.isIdentifier(parameter.name) || parameter.initializer || parameter.dotDotDotToken || parameter.questionToken) throw new Error("Expected required positional parameters");
    return parameter.name.text;
  });
  if (new Set(parameters).size !== parameters.length) throw new Error("Expected distinct parameter names");
  const [statement, ...rest] = declaration.body.statements;
  if (!statement || rest.length || !ts.isReturnStatement(statement) || !statement.expression) throw new Error("Expected one return expression");
  return { parameters, evaluate: expression(ts, statement.expression, parameters) };
}

export async function makeChallenge(root, unit) {
  const { default: ts } = await import("typescript");
  const current = await sourceFingerprint(root, unit.file);
  if (!current) throw new Error("Indexed source is unavailable");
  const source = ts.createSourceFile(unit.file, current.bytes.toString("utf8"), ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length) throw new Error("Fix syntax errors before generating a challenge");
  const declaration = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === unit.name &&
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 === unit.start);
  if (!declaration) throw new Error("Select a top-level function declaration");
  const { parameters, evaluate } = compile(ts, declaration);
  const values = [-10, -1, 0, 1, 10];
  const inputs = parameters.length === 1 ? values.map((a) => [a]) : values.flatMap((a) => values.map((b) => [a, b]));
  for (let index = 0; index < 24; index++) inputs.push(parameters.map(() => randomInt(-100, 101)));
  const cases = [...new Map(inputs.map((args) => [args.join(","), { args, expected: evaluate(args) }])).values()];
  if (cases.some(({ expected }) => !Number.isFinite(expected) && typeof expected !== "boolean")) {
    throw new Error("Reference produces a non-finite result for sampled inputs");
  }
  return {
    id: randomUUID(), unit: unit.id, revision: unit.revision, parameters: parameters.length, cases,
    file: unit.file, start: unit.start, end: unit.end,
    prompt: `Reimplement ${unit.name} as one synchronous function with ${parameters.length} required numeric parameter(s) and a single return expression. Match its output for negative, zero and positive integers. Arithmetic, comparisons and conditionals are supported. Submit the function source with challenge-submit.`,
  };
}

export async function gradeChallenge(challenge, text) {
  if (!text || text.length > 2_000) throw new Error("Provide up to 2,000 characters of solution source");
  const { default: ts } = await import("typescript");
  const source = ts.createSourceFile("solution.ts", text, ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length || source.statements.length !== 1) throw new Error("Submit one syntactically valid function declaration");
  const { parameters, evaluate } = compile(ts, source.statements[0]);
  if (parameters.length !== challenge.parameters) throw new Error("The function has the wrong parameter count");
  const passed = challenge.cases.filter(({ args, expected }) => evaluate(args) === expected).length;
  return { passed, total: challenge.cases.length, correct: passed === challenge.cases.length };
}
