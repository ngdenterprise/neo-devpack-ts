import * as tsm from "ts-morph";
import { CompileError } from "./compiler";
import { join } from "path";
import { readFile } from "fs/promises";
import { ReadonlyUint8Array } from "./utility/ReadonlyArrays";

export function isNotNullOrUndefined<T extends Object>(input: null | undefined | T): input is T {
    return input != null;
}

export function toDiagnostic(error: unknown): tsm.ts.Diagnostic {
    const messageText = error instanceof Error
        ? error.message
        : "unknown error";
    const node = error instanceof CompileError
        ? error.node
        : undefined;
    return {
        category: tsm.ts.DiagnosticCategory.Error,
        code: 0,
        file: node?.getSourceFile().compilerNode,
        length: node
            ? node.getEnd() - node.getPos()
            : undefined,
        messageText,
        start: node?.getPos(),
        source: node?.print()
    };
}

export async function createContractProject(scfxSource?: string) {
    const project = new tsm.Project({
        compilerOptions: {
            experimentalDecorators: true,
            // specify lib file directly to avoid bringing in web apis like DOM and WebWorker
            lib: ["lib.es2020.d.ts"],
            target: tsm.ts.ScriptTarget.ES2020,
            moduleResolution: tsm.ts.ModuleResolutionKind.NodeJs,
        },
        useInMemoryFileSystem: true,
    });

    // load SCFX definitions
    if (!scfxSource) {
        const scfxPath = join(__dirname, "../../framework/src/index.d.ts");
        scfxSource = await readFile(scfxPath, 'utf8');
    }

    await project.getFileSystem().writeFile('/node_modules/@neo-project/neo-contract-framework/index.d.ts', scfxSource);
    return project;
}

const checkFlags = (type: tsm.Type, flags: tsm.ts.TypeFlags) => type.getFlags() & flags;

export const isBigIntLike = (type: tsm.Type) => checkFlags(type, tsm.ts.TypeFlags.BigIntLike);
export const isBooleanLike = (type: tsm.Type) => checkFlags(type, tsm.ts.TypeFlags.BooleanLike);
export const isNumberLike = (type: tsm.Type) => checkFlags(type, tsm.ts.TypeFlags.NumberLike);
export const isStringLike = (type: tsm.Type) => checkFlags(type, tsm.ts.TypeFlags.StringLike);
export const isVoidLike = (type: tsm.Type) => checkFlags(type, tsm.ts.TypeFlags.VoidLike);

export function isConst(node: tsm.TypeNode) {
    if (tsm.Node.isTypeReference(node)) {
        const typeName = node.getTypeName();
        if (typeName instanceof tsm.Identifier) {
            return typeName.compilerNode.originalKeywordKind === tsm.SyntaxKind.ConstKeyword;
        }
    }
    return false;
}

export function isCompoundAssignment(kind: tsm.SyntaxKind) {
    switch (kind) {
        case tsm.SyntaxKind.PlusEqualsToken:
        case tsm.SyntaxKind.MinusEqualsToken:
        case tsm.SyntaxKind.AsteriskAsteriskEqualsToken:
        case tsm.SyntaxKind.AsteriskEqualsToken:
        case tsm.SyntaxKind.SlashEqualsToken:
        case tsm.SyntaxKind.PercentEqualsToken:
        case tsm.SyntaxKind.AmpersandEqualsToken:
        case tsm.SyntaxKind.BarEqualsToken:
        case tsm.SyntaxKind.CaretEqualsToken:
        case tsm.SyntaxKind.LessThanLessThanEqualsToken:
        case tsm.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken:
        case tsm.SyntaxKind.GreaterThanGreaterThanEqualsToken:
        case tsm.SyntaxKind.BarBarEqualsToken:
        case tsm.SyntaxKind.AmpersandAmpersandEqualsToken:
        case tsm.SyntaxKind.QuestionQuestionEqualsToken:
            return true;
        default:
            return false;
    }
}

// export function getNumericLiteral(node: tsm.NumericLiteral) {
//     const literal = node.getLiteralValue();
//     if (!Number.isInteger(literal)) throw new CompileError(`invalid non-integer numeric literal`, node);
//     return literal;
// }

// @internal
export function getConstantValue(node: tsm.Expression) {
    switch (node.getKind()) {
        case tsm.SyntaxKind.NullKeyword:
            return null;
        case tsm.SyntaxKind.BigIntLiteral: 
            return (node as tsm.BigIntLiteral).getLiteralValue() as bigint;
        case tsm.SyntaxKind.NumericLiteral: {
            const literal = (node as tsm.NumericLiteral).getLiteralValue();
            if (!Number.isInteger(literal)) throw new CompileError(`invalid non-integer numeric literal`, node);
            return BigInt(literal);
        }
        case tsm.SyntaxKind.FalseKeyword:
            return false;
        case tsm.SyntaxKind.TrueKeyword:
            return true;
        case tsm.SyntaxKind.StringLiteral: {
            const literal = (node as tsm.StringLiteral).getLiteralValue();
            return <ReadonlyUint8Array>Buffer.from(literal, 'utf8');
        }
        // case tsm.SyntaxKind.ArrayLiteralExpression: {
        //     const buffer = new Array<number>();
        //     for (const e of (node as tsm.ArrayLiteralExpression).getElements()) {
        //         if (tsm.Node.isNumericLiteral(e)) {
        //             buffer.push(getNumericLiteral(e) % 256);
        //         } else {
        //             return undefined;
        //         }
        //     }
        //     return Uint8Array.from(buffer);
        // }
        default:
            throw new CompileError(`Unsupported const type ${node.getKindName()}`, node);
    }
}

function toBigInt(buffer: Buffer): bigint {
    return BigInt(`0x${buffer.toString('hex')}`);
}

function toBuffer(value: bigint): Buffer {
    let str = value.toString(16);
    if (str.length % 2 == 1) { str = '0' + str }
    return Buffer.from(str, 'hex');
}

function allBitsSet(buffer: Uint8Array): boolean {
    const length = buffer.length;
    for (let i = 0; i < length; i++) {
        if (buffer[i] !== 0xff) return false;
    }
    return true;
}

export function byteArrayToBigInt(value: Uint8Array): bigint {
    const buffer = Buffer.from(value);
    buffer.reverse();
    const negativeValue = buffer[0] & 0x80;
    if (!negativeValue) {
        return toBigInt(buffer);
    }

    throw new Error("Not Implemented");
}

// convert JS BigInt to C# BigInt byte array encoding
export function bigIntToByteArray(value: bigint): Uint8Array {
    if (value >= 0n) {
        // convert value to buffer
        let buffer = toBuffer(value);
        // if the most significant bit is 1, prepend a 0x00 byte to 
        // indicate positive value
        if (buffer[0] & 0x80) {
            buffer = Buffer.concat([Buffer.alloc(1, 0), buffer])
        }
        // reverse endianess
        return buffer.reverse();
    } else {
        // convert negative number to positive and create buffer 
        let buffer = toBuffer(value * -1n);
        // if the buffer has all the bits set, prepend an empty padding byte
        buffer = allBitsSet(buffer)
            ? Buffer.concat([Buffer.alloc(1, 0x00), buffer])
            : buffer;
        // invert the bits
        const end = buffer.length;
        let i = 0;
        while (i < end) {
            buffer[i] = buffer[i] ^ 0xff;
            i++;
        }
        // Convert the updated buffer to a bigint, add one, 
        // and convert back to buffer
        let buffer2 = toBuffer(toBigInt(buffer) + 1n);
        // if the most significant bit isn't 1, prepend a 0xff byte 
        // to indicate negative value
        if (!(buffer2[0] & 0x80)) {
            buffer2 = Buffer.concat([Buffer.alloc(1, 0xff), buffer2])
        }
        // reverse endianess
        return buffer2.reverse();
    }
}

export function getSymbolOrCompileError(node: tsm.Node) {
    const symbol = node.getSymbol();
    if (!symbol) throw new CompileError("undefined symbol", node);
    return symbol;
}

export function asKindOrCompileError<TKind extends tsm.SyntaxKind>(node: tsm.Node, kind: TKind): tsm.KindToNodeMappings[TKind] {
    const node2 = node.asKind(kind);
    if (node2) { return node2; }
    throw new CompileError(`Invalid node kind. Expected ${tsm.SyntaxKind[kind]}, received ${node.getKindName()}`, node);
}

export function asExpressionOrCompileError(node: tsm.Node): tsm.Expression {
    if (tsm.Node.isExpression(node)) { return node; }
    throw new CompileError(`Invalid expression node ${node.getKindName()}`, node);
}