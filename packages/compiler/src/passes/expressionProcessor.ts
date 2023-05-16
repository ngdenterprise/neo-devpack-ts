import * as tsm from "ts-morph";
import { flow, pipe } from 'fp-ts/function';
import * as ROA from 'fp-ts/ReadonlyArray';
import * as RNEA from 'fp-ts/ReadonlyNonEmptyArray';
import * as E from "fp-ts/Either";
import * as O from 'fp-ts/Option'
import * as TS from "../TS";
import { getBooleanConvertOps, getStringConvertOps, isJumpTargetOp, Operation, pushInt, pushString } from "../types/Operation";
import { CompileTimeObject, Scope, ScopedNodeFunc, resolve, resolveType } from "../types/CompileTimeObject";
import { CompileError, ParseError, isStringLike, isVoidLike, makeParseError } from "../utils";
import { ReadonlyNonEmptyArray } from "fp-ts/ReadonlyNonEmptyArray";

export function makeConditionalExpression({ condition, whenTrue, whenFalse }: {
    condition: readonly Operation[];
    whenTrue: readonly Operation[];
    whenFalse: readonly Operation[];
}): readonly Operation[] {

    const falseTarget: Operation = { kind: "noop" };
    const endTarget: Operation = { kind: "noop" };
    return pipe(
        condition,
        ROA.append({ kind: 'jumpifnot', target: falseTarget } as Operation),
        ROA.concat(whenTrue),
        ROA.append({ kind: 'jump', target: endTarget } as Operation),
        ROA.append(falseTarget as Operation),
        ROA.concat(whenFalse),
        ROA.append(endTarget as Operation)
    );
}

interface ExpressionChainContext {
    readonly scope: Scope;
    readonly endTarget: Operation;
    readonly ops: readonly Operation[];
    readonly cto?: CompileTimeObject;
    readonly error?: ParseError
}

function reduceBigIntLitera(context: ExpressionChainContext, node: tsm.BigIntLiteral): ExpressionChainContext {
    const value = node.getLiteralValue() as bigint;
    const operations = ROA.append<Operation>(pushInt(value))(context.ops);
    return { ...context, ops: operations }
}

function reduceBooleanLiteral(context: ExpressionChainContext, node: tsm.BooleanLiteral): ExpressionChainContext {
    const value = node.getLiteralValue();
    const operations = ROA.append<Operation>({ kind: "pushbool", value })(context.ops);
    return { ...context, ops: operations }
}

function reduceNullLiteral(context: ExpressionChainContext, node: tsm.NullLiteral): ExpressionChainContext {
    const operations = ROA.append<Operation>({ kind: "pushnull" })(context.ops);
    return { ...context, ops: operations }
}

function reduceNumericLiteral(context: ExpressionChainContext, node: tsm.NumericLiteral): ExpressionChainContext {
    const value = node.getLiteralValue();
    return Number.isInteger(value)
        ? { ...context, ops: ROA.append<Operation>(pushInt(value))(context.ops) }
        : { ...context, error: makeParseError(node)(`invalid non-integer numeric literal ${value}`) };
}

function reduceStringLiteral(context: ExpressionChainContext, node: tsm.StringLiteral): ExpressionChainContext {
    const value = node.getLiteralValue();
    const operations = ROA.append<Operation>(pushString(value))(context.ops);
    return { ...context, ops: operations }
}

function reduceIdentifier(context: ExpressionChainContext, node: tsm.Identifier): ExpressionChainContext {

    return pipe(
        node,
        TS.parseSymbol,
        E.chain(symbol => pipe(
            symbol,
            resolve(context.scope),
            E.fromOption(() => makeParseError(node)(`Failed to resolve identifier ${symbol.getName()}`))
        )),
        E.bindTo('cto'),
        E.bind('loadOps', ({ cto }) => cto.getLoadOps
            ? cto.getLoadOps(context.scope)(node)
            : E.left(makeParseError(node)(`${cto.symbol.getName()} does not support load operations`))),
        E.match(
            error => (<ExpressionChainContext>{ ...context, error }),
            ({ cto, loadOps }) => ({ ...context, cto, ops: ROA.concat(context.ops)(loadOps) })
        )
    )
}

function reduceExpressionChain(context: ExpressionChainContext, node: tsm.Expression): ExpressionChainContext {
    if (context.error) return context;

    switch (node.getKind()) {
        case tsm.SyntaxKind.BigIntLiteral: return reduceBigIntLitera(context, node as tsm.BigIntLiteral);
        case tsm.SyntaxKind.FalseKeyword: return reduceBooleanLiteral(context, node as tsm.BooleanLiteral);
        case tsm.SyntaxKind.Identifier: return reduceIdentifier(context, node as tsm.Identifier);
        case tsm.SyntaxKind.NullKeyword: return reduceNullLiteral(context, node as tsm.NullLiteral);
        case tsm.SyntaxKind.NumericLiteral: return reduceNumericLiteral(context, node as tsm.NumericLiteral);
        case tsm.SyntaxKind.StringLiteral: return reduceStringLiteral(context, node as tsm.StringLiteral);
        case tsm.SyntaxKind.TrueKeyword: return reduceBooleanLiteral(context, node as tsm.BooleanLiteral);
    }

    return {
        ...context,
        error: makeParseError(node)(`reduceChainContext ${node.getKindName()} not implemented`)
    }
}

function makeExpressionChain(node: tsm.Expression): ReadonlyNonEmptyArray<tsm.Expression> {
    return makeChain(RNEA.of<tsm.Expression>(node));

    function makeChain(chain: ReadonlyNonEmptyArray<tsm.Expression>): ReadonlyNonEmptyArray<tsm.Expression> {
        return pipe(
            chain,
            RNEA.head,
            TS.getExpression,
            O.match(
                () => chain,
                expr => makeChain(ROA.prepend(expr)(chain))
            )
        );
    }
}


export function parseExpression(scope: Scope) {
    return (node: tsm.Expression): E.Either<ParseError, readonly Operation[]> => {

        const chain = makeExpressionChain(node);
        const context = <ExpressionChainContext>{
            scope,
            endTarget: { kind: 'noop' },
            ops: [],
        }
        const result = ROA.reduce(context, reduceExpressionChain)(chain);
        if (result.error) return E.left(result.error);

        const hasEndJumps = pipe(
            result.ops,
            ROA.filter(isJumpTargetOp),
            ROA.filter(op => op.target === context.endTarget),
            ROA.isNonEmpty
        );

        let operations = result.ops;
        if (hasEndJumps) {
            operations = ROA.append(context.endTarget)(operations);
        }
        return E.of(operations);


        // if (tsm.Node.hasExpression(node)) {
        //     throw new CompileError(`Unexpected expression node ${node.getKindName()}`, node);
        // }
        // switch (node.getKind()) {
        //     case tsm.SyntaxKind.AsExpression: return parseAsExpression(scope)(node as tsm.AsExpression);
        //     case tsm.SyntaxKind.BinaryExpression: return parseBinaryExpression(scope)(node as tsm.BinaryExpression);
        //     case tsm.SyntaxKind.CallExpression: return parseCallExpression(scope)(node as tsm.CallExpression);
        //     case tsm.SyntaxKind.Identifier: return parseIdentifier(scope)(node as tsm.Identifier);
        //     case tsm.SyntaxKind.NewExpression: return parseNewExpression(scope)(node as tsm.NewExpression);
        //     case tsm.SyntaxKind.NonNullExpression: return parseNonNullExpression(scope)(node as tsm.NonNullExpression);
        //     case tsm.SyntaxKind.ParenthesizedExpression: return parseParenthesizedExpression(scope)(node as tsm.ParenthesizedExpression);
        //     case tsm.SyntaxKind.PostfixUnaryExpression: return parsePostfixUnaryExpression(scope)(node as tsm.PostfixUnaryExpression);
        //     case tsm.SyntaxKind.PrefixUnaryExpression: return parsePrefixUnaryExpression(scope)(node as tsm.PrefixUnaryExpression);
        //     case tsm.SyntaxKind.PropertyAccessExpression: return parsePropertyAccessExpression(scope)(node as tsm.PropertyAccessExpression);

        //     default:
        //         return E.left(makeParseError(node)(`parseExpression ${node.getKindName()} not impl`));
        // };
    }
}

export function parseExpressionAsBoolean(scope: Scope) {
    return (node: tsm.Expression): E.Either<ParseError, readonly Operation[]> => {
        return pipe(
            node,
            parseExpression(scope),
            E.map(ROA.concat(getBooleanConvertOps(node.getType())))
        )
    }
}

























// export const parseCallExpression =
//     (scope: Scope) => (node: tsm.CallExpression): E.Either<ParseError, readonly Operation[]> => {
//         const q = tsm.Node.isExpressioned(node);

//         return pipe(
//             node.getExpression(),
//             resolveExpression(scope),
//             O.chain(cto => O.fromNullable(cto.parseCall)),
//             E.fromOption(() => makeParseError(node)(`parseCall not available for ${node.getExpression().print()}`)),
//             E.chain(parseCall => parseCall(scope)(node))
//         )
//     }

// export const parseNewExpression =
//     (scope: Scope) => (node: tsm.NewExpression): E.Either<ParseError, readonly Operation[]> => {
//         return pipe(
//             node.getExpression(),
//             resolveExpression(scope),
//             O.chain(cto => O.fromNullable(cto.parseConstructor)),
//             E.fromOption(() => makeParseError(node)(`parseConstructor not available for ${node.getExpression().print()}`)),
//             E.chain(parseConstructor => parseConstructor(scope)(node))
//         )
//     }

// export const parsePropertyAccessExpression =
//     (scope: Scope) => (node: tsm.PropertyAccessExpression): E.Either<ParseError, readonly Operation[]> => {
//         return pipe(
//             node,
//             resolvePropertyAccessExpression(scope),
//             E.fromOption(() => makeParseError(node)(`failed to resolve ${node.getName()} property`)),
//             E.chain(cto => pipe(
//                 cto.getLoadOps,
//                 E.fromNullable(makeParseError(node)(`can't load ${node.getName()} property`))
//             )),
//             E.chain(getLoadOps => getLoadOps(scope)(node))
//         );
//     }

// export const parseIdentifier =
//     (scope: Scope) => (node: tsm.Identifier): E.Either<ParseError, readonly Operation[]> => {

//         // undefined resolves as a symbol rather than as a keyword like null does
//         const type = node.getType();
//         if (type.isUndefined()) { return E.of(ROA.of({ kind: 'pushnull' })) }

//         return pipe(
//             node,
//             resolveIdentifier(scope),
//             E.fromOption(() => makeParseError(node)(`failed to resolve ${node.getText()} identifier`)),
//             E.chain(cto => pipe(
//                 cto.getLoadOps,
//                 E.fromNullable(makeParseError(node)(`can't load ${node.getText()} identifier`))
//             )),
//             E.chain(getLoadOps => getLoadOps(scope)(node))
//         );
//     }

// export const parseAsExpression =
//     (scope: Scope) => (node: tsm.AsExpression): E.Either<ParseError, readonly Operation[]> => {
//         return parseExpression(scope)(node.getExpression())
//     }

// const binaryOperationMap = new Map<tsm.SyntaxKind, Operation>([
//     [tsm.SyntaxKind.PlusToken, { kind: "add" }],
//     [tsm.SyntaxKind.MinusToken, { kind: "subtract" }],
//     [tsm.SyntaxKind.AsteriskToken, { kind: "multiply" }],
//     [tsm.SyntaxKind.SlashToken, { kind: "divide" }],
//     [tsm.SyntaxKind.PercentToken, { kind: "modulo" }],
//     [tsm.SyntaxKind.GreaterThanGreaterThanToken, { kind: "shiftright" }],
//     [tsm.SyntaxKind.LessThanLessThanToken, { kind: "shiftleft" }],
//     [tsm.SyntaxKind.BarToken, { kind: "or" }],
//     [tsm.SyntaxKind.AmpersandToken, { kind: "and" }],
//     [tsm.SyntaxKind.CaretToken, { kind: "xor" }],
//     [tsm.SyntaxKind.EqualsEqualsToken, { kind: "equal" }],
//     [tsm.SyntaxKind.EqualsEqualsEqualsToken, { kind: "equal" }],
//     [tsm.SyntaxKind.ExclamationEqualsToken, { kind: "notequal" }],
//     [tsm.SyntaxKind.ExclamationEqualsEqualsToken, { kind: "notequal" }],
//     [tsm.SyntaxKind.GreaterThanToken, { kind: "greaterthan" }],
//     [tsm.SyntaxKind.GreaterThanEqualsToken, { kind: "greaterthanorequal" }],
//     [tsm.SyntaxKind.LessThanToken, { kind: "lessthan" }],
//     [tsm.SyntaxKind.LessThanEqualsToken, { kind: "lessthanorequal" }],
//     [tsm.SyntaxKind.AsteriskAsteriskToken, { kind: "power" }],
// ]) as ReadonlyMap<tsm.SyntaxKind, Operation>;

// function parseBinaryOperatorExpression(scope: Scope, operator: tsm.ts.BinaryOperator, left: tsm.Expression, right: tsm.Expression): E.Either<string | ParseError, readonly Operation[]> {

//     if (operator === tsm.SyntaxKind.PlusToken && isStringLike(left.getType())) {
//         return parseStringConcat(scope, left, right);
//     }

//     const operatorOperation = binaryOperationMap.get(operator);
//     if (operatorOperation) {
//         return parseOperatorOperation(operatorOperation, scope, left, right);
//     }

//     switch (operator) {
//         case tsm.SyntaxKind.QuestionQuestionToken:
//             return parseNullishCoalescing(scope, left, right);
//         case tsm.SyntaxKind.CommaToken:
//             return parseCommaOperator(scope, left, right);
//         case tsm.SyntaxKind.BarBarToken:
//         case tsm.SyntaxKind.AmpersandAmpersandToken:
//             return parseLogicalOperation(operator, scope, left, right);
//         case tsm.SyntaxKind.InKeyword:
//             return parseInOperator(scope, left, right);
//         // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Unsigned_right_shift
//         case tsm.SyntaxKind.GreaterThanGreaterThanGreaterThanToken:
//         // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/instanceof
//         case tsm.SyntaxKind.InstanceOfKeyword:
//             return E.left(`${tsm.SyntaxKind[operator]} operator not supported`);
//     }

//     return E.left(`Invalid binary operator ${tsm.SyntaxKind[operator]}`);
// }
// function parseOperatorOperation(operatorOperation: Operation, scope: Scope, left: tsm.Expression, right: tsm.Expression) {
//     return pipe(
//         E.Do,
//         E.bind('leftOps', () => parseExpression(scope)(left)),
//         E.bind('rightOps', () => parseExpression(scope)(right)),
//         E.map(({ leftOps, rightOps }) => pipe(
//             leftOps,
//             ROA.concat(rightOps),
//             ROA.append(operatorOperation)
//         ))
//     );
// }

// // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Logical_OR
// // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Logical_AND
// function parseLogicalOperation(operator: tsm.SyntaxKind.BarBarToken | tsm.SyntaxKind.AmpersandAmpersandToken, scope: Scope, left: tsm.Expression, right: tsm.Expression) {
//     const rightTarget: Operation = { kind: "noop" };
//     const endTarget: Operation = { kind: "noop" };

//     const logicalOps: readonly Operation[] = operator === tsm.SyntaxKind.BarBarToken
//         ? [{ kind: "jumpifnot", target: rightTarget }, { kind: "pushbool", value: true }]
//         : [{ kind: "jumpif", target: rightTarget }, { kind: "pushbool", value: false }];

//     return pipe(
//         E.Do,
//         E.bind('leftOps', () => parseExpressionAsBoolean(scope)(left)),
//         E.bind('rightOps', () => parseExpressionAsBoolean(scope)(right)),
//         E.map(({ leftOps, rightOps }) => pipe(
//             leftOps,
//             ROA.concat(logicalOps),
//             ROA.concat<Operation>([{ kind: "jump", target: endTarget }, rightTarget]),
//             ROA.concat(rightOps),
//             ROA.concat<Operation>([endTarget])
//         ))
//     );
// }

// function parseStringConcat(scope: Scope, left: tsm.Expression, right: tsm.Expression): E.Either<ParseError, readonly Operation[]> {
//     return pipe(
//         E.Do,
//         E.bind('leftOps', () => parseExpressionAsString(scope)(left)),
//         E.bind('rightOps', () => parseExpressionAsString(scope)(right)),
//         E.map(({ leftOps, rightOps }) => pipe(
//             leftOps,
//             ROA.concat(rightOps),
//             ROA.append<Operation>({ kind: "concat" })
//         ))
//     );
// }

// // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing
// // The nullish coalescing (??) operator is a logical operator that returns its right-hand side operand
// // when its left-hand side operand is null or undefined, and otherwise returns its left-hand side operand.
// function parseNullishCoalescing(scope: Scope, left: tsm.Expression, right: tsm.Expression) {
//     const endTarget: Operation = { kind: "noop" };
//     return pipe(
//         E.Do,
//         E.bind('leftOps', () => parseExpression(scope)(left)),
//         E.bind('rightOps', () => parseExpression(scope)(right)),
//         E.map(({ leftOps, rightOps }) => pipe(
//             leftOps,
//             ROA.concat<Operation>([
//                 { kind: "duplicate" },
//                 { kind: "isnull" },
//                 { kind: "jumpifnot", target: endTarget },
//                 { kind: "drop" },
//             ]),
//             ROA.concat(rightOps),
//             ROA.append<Operation>(endTarget)
//         ))
//     );
// }

// // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/in
// // The in operator returns true if the specified property is in the specified object or its prototype chain.
// function parseInOperator(scope: Scope, left: tsm.Expression, right: tsm.Expression): E.Either<ParseError, readonly Operation[]> {
//     return pipe(
//         E.Do,
//         E.bind('leftOps', () => parseExpression(scope)(left)),
//         E.bind('rightOps', () => parseExpression(scope)(right)),
//         E.map(({ leftOps, rightOps }) => pipe(
//             rightOps,
//             ROA.concat(leftOps),
//             ROA.append<Operation>({ kind: "haskey" })
//         ))
//     );
// }

// // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Comma_operator
// // The comma (,) operator evaluates each of its operands (from left to right)
// // and returns the value of the last operand.
// function parseCommaOperator(scope: Scope, left: tsm.Expression, right: tsm.Expression) {
//     const needsDrop = tsm.Node.isExpression(left)
//         && !isVoidLike(left.getType())
//         && !TS.isAssignmentExpression(left);
//     const dropOps = needsDrop
//         ? ROA.of<Operation>({ kind: "drop" })
//         : ROA.empty;

//     return pipe(
//         E.Do,
//         E.bind('leftOps', () => parseExpression(scope)(left)),
//         E.bind('rightOps', () => parseExpression(scope)(right)),
//         E.map(({ leftOps, rightOps }) => pipe(
//             leftOps,
//             ROA.concat(dropOps),
//             ROA.concat(rightOps)
//         ))
//     );
// }


// export const parseBinaryExpression =
//     (scope: Scope) =>
//         (node: tsm.BinaryExpression): E.Either<ParseError, readonly Operation[]> => {

//             const operator = TS.getBinaryOperator(node);
//             const left = node.getLeft();
//             const right = node.getRight();

//             if (operator === tsm.SyntaxKind.EqualsToken) {
//                 const loadOps = pipe(right, parseExpression(scope))
//                 // todo: left store ops
//                 return E.left(makeParseError(node)(`assignment not yet implemented`));
//             } else {
//                 const mappedOperator = TS.compoundAssignmentOperatorMap.get(operator);
//                 if (mappedOperator) {
//                     const loadOps = parseBinaryOperatorExpression(scope, mappedOperator, left, right);
//                     // todo: left store ops
//                     return E.left(makeParseError(node)(`assignment not yet implemented`));
//                 } else {
//                     return pipe(
//                         parseBinaryOperatorExpression(scope, operator, left, right),
//                         E.mapLeft(msg => typeof msg === "string" ? makeParseError(node)(msg) : msg)
//                     );
//                 }
//             }
//         }

// export const parsePrefixUnaryExpression =
//     (scope: Scope) =>
//         (node: tsm.PrefixUnaryExpression): E.Either<ParseError, readonly Operation[]> => {
//             const operand = node.getOperand();
//             const operator = node.getOperatorToken();

//             switch (operator) {
//                 case tsm.SyntaxKind.PlusPlusToken:
//                 case tsm.SyntaxKind.MinusMinusToken: {
//                     const kind = operator === tsm.SyntaxKind.PlusPlusToken ? "increment" : "decrement";
//                     // TODO: parse operand, append kind (inc/dec), dup, store operand
//                     return E.left(makeParseError(node)(`assignment not yet implemented`));
//                 }
//                 case tsm.SyntaxKind.PlusToken:
//                     return pipe(operand, parseExpression(scope))
//                 case tsm.SyntaxKind.MinusToken:
//                     return pipe(operand, parseExpression(scope), E.map(ROA.append<Operation>({ kind: "negate" })))
//                 case tsm.SyntaxKind.TildeToken:
//                     return pipe(operand, parseExpression(scope), E.map(ROA.append<Operation>({ kind: "invert" })))
//                 case tsm.SyntaxKind.ExclamationToken:
//                     return pipe(operand, parseExpressionAsBoolean(scope), E.map(ROA.append<Operation>({ kind: "not" })))
//             }

//             return E.left(makeParseError(node)(`Invalid prefix unary operator ${tsm.SyntaxKind[operator]}`));
//         }

// export const parsePostfixUnaryExpression =
//     (scope: Scope) =>
//         (node: tsm.PostfixUnaryExpression): E.Either<ParseError, readonly Operation[]> => {
//             const operand = node.getOperand();
//             const kind = node.getOperatorToken() === tsm.SyntaxKind.PlusPlusToken ? "increment" : "decrement";
//             // TODO: parse operand, dup, append kind (inc/dec), store operand
//             return E.left(makeParseError(node)(`assignment not yet implemented`));
//         }

// export const parseParenthesizedExpression =
//     (scope: Scope) =>
//         (node: tsm.ParenthesizedExpression): E.Either<ParseError, readonly Operation[]> => {
//             return parseExpression(scope)(node.getExpression())
//         }

// export const parseNonNullExpression =
//     (scope: Scope) =>
//         (node: tsm.NonNullExpression): E.Either<ParseError, readonly Operation[]> => {
//             return parseExpression(scope)(node.getExpression())
//         }

// export function parseExpression(scope: Scope) {
//     return (node: tsm.Expression): E.Either<ParseError, readonly Operation[]> => {

//         if (tsm.Node.hasExpression(node)) {
//             throw new CompileError(`Unexpected expression node ${node.getKindName()}`, node);
//         }
//         switch (node.getKind()) {
//             case tsm.SyntaxKind.AsExpression: return parseAsExpression(scope)(node as tsm.AsExpression);
//             case tsm.SyntaxKind.BigIntLiteral: return parseBigIntLiteral(node as tsm.BigIntLiteral);
//             case tsm.SyntaxKind.BinaryExpression: return parseBinaryExpression(scope)(node as tsm.BinaryExpression);
//             case tsm.SyntaxKind.CallExpression: return parseCallExpression(scope)(node as tsm.CallExpression);
//             case tsm.SyntaxKind.FalseKeyword: return parseBooleanLiteral(node as tsm.FalseLiteral);
//             case tsm.SyntaxKind.Identifier: return parseIdentifier(scope)(node as tsm.Identifier);
//             case tsm.SyntaxKind.NewExpression: return parseNewExpression(scope)(node as tsm.NewExpression);
//             case tsm.SyntaxKind.NonNullExpression: return parseNonNullExpression(scope)(node as tsm.NonNullExpression);
//             case tsm.SyntaxKind.NullKeyword: return parseNullLiteral(node as tsm.NullLiteral);
//             case tsm.SyntaxKind.NumericLiteral: return parseNumericLiteral(node as tsm.NumericLiteral);
//             case tsm.SyntaxKind.ParenthesizedExpression: return parseParenthesizedExpression(scope)(node as tsm.ParenthesizedExpression);
//             case tsm.SyntaxKind.PostfixUnaryExpression: return parsePostfixUnaryExpression(scope)(node as tsm.PostfixUnaryExpression);
//             case tsm.SyntaxKind.PrefixUnaryExpression: return parsePrefixUnaryExpression(scope)(node as tsm.PrefixUnaryExpression);
//             case tsm.SyntaxKind.PropertyAccessExpression: return parsePropertyAccessExpression(scope)(node as tsm.PropertyAccessExpression);
//             case tsm.SyntaxKind.StringLiteral: return parseStringLiteral(node as tsm.StringLiteral);
//             case tsm.SyntaxKind.TrueKeyword: return parseBooleanLiteral(node as tsm.TrueLiteral);

//             default:
//                 return E.left(makeParseError(node)(`parseExpression ${node.getKindName()} not impl`));
//         };
//     }
// }

// export function parseExpressionAsBoolean(scope: Scope) {
//     return (node: tsm.Expression): E.Either<ParseError, readonly Operation[]> => {
//         return pipe(
//             node,
//             parseExpression(scope),
//             E.map(ROA.concat(getBooleanConvertOps(node.getType())))
//         )
//     }
// }

// export function parseExpressionAsString(scope: Scope) {
//     return (node: tsm.Expression): E.Either<ParseError, readonly Operation[]> => {


//         return pipe(
//             node,
//             parseExpression(scope),
//             E.map(ROA.concat(getStringConvertOps(node.getType())))
//         )
//     }
// }

// function resolveIdentifier(scope: Scope) {
//     return (node: tsm.Identifier): O.Option<CompileTimeObject> => {
//         return pipe(
//             node,
//             TS.getSymbol,
//             O.chain(resolve(scope))
//         );
//     };
// }

// function combineCTO(cto: CompileTimeObject, parentCTO: CompileTimeObject): CompileTimeObject {

//     const getLoadOps: ScopedNodeFunc<tsm.Expression> = (scope) => (node) => pipe(
//         parentCTO.getLoadOps,
//         E.fromNullable(makeParseError(parentCTO.node)(`no load ops`)),
//         E.chain(getLoadOps => getLoadOps(scope)(node)),
//         E.chain(parentOps => pipe(
//             cto.getLoadOps,
//             E.fromNullable(makeParseError(cto.node)(`no load ops`)),
//             E.chain(getLoadOps => getLoadOps(scope)(node)),
//             E.map(ctoOps => ROA.concat(ctoOps)(parentOps))
//         ))
//     );

//     // TODO: store ops

//     return <CompileTimeObject>{
//         ...cto,
//         getLoadOps
//     }

// }

// function resolvePropertyAccessExpression(scope: Scope) {
//     return (node: tsm.PropertyAccessExpression): O.Option<CompileTimeObject> => {
//         const expr = node.getExpression();
//         return pipe(
//             node,
//             TS.getSymbol,
//             O.chain(symbol => pipe(
//                 expr,
//                 resolveExpression(scope),
//                 O.bindTo('exprcto'),
//                 O.bind('propcto', ({ exprcto }) => pipe(
//                     exprcto,
//                     getProperty(symbol),
//                     O.alt(() => pipe(
//                         expr.getType(),
//                         TS.getTypeSymbol,
//                         O.chain(resolveType(scope)),
//                         O.chain(getProperty(symbol))
//                     ))
//                 ))
//             )),
//             O.map(({ exprcto, propcto }) => combineCTO(propcto, exprcto))
//         );
//     }

//     function getProperty(symbol: tsm.Symbol) {
//         return (cto: CompileTimeObject): O.Option<CompileTimeObject> => {
//             return pipe(
//                 cto.getProperty,
//                 O.fromNullable,
//                 O.chain(getProperty => getProperty(symbol))
//             )
//         }
//     }
// }


// function resolveCallExpression(scope: Scope) {
//     return (node: tsm.CallExpression): O.Option<CompileTimeObject> => {
//         return pipe(
//             node.getExpression(),
//             resolveExpression(scope),
//         )
//     }
// }

// export function resolveExpression(scope: Scope) {
//     return (node: tsm.Expression): O.Option<CompileTimeObject> => {

//         switch (node.getKind()) {
//             case tsm.SyntaxKind.CallExpression: return resolveCallExpression(scope)(node as tsm.CallExpression);
//             case tsm.SyntaxKind.Identifier: return resolveIdentifier(scope)(node as tsm.Identifier);
//             case tsm.SyntaxKind.PropertyAccessExpression: return resolvePropertyAccessExpression(scope)(node as tsm.PropertyAccessExpression);
//             case tsm.SyntaxKind.NonNullExpression: return resolveExpression(scope)((node as tsm.NonNullExpression).getExpression());
//         };

//         throw new CompileError(`resolveExpression ${node.getKindName()} not impl`, node);
//     };
// }

