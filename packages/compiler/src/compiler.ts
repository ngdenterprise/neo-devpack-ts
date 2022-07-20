import { sc, u } from "@cityofzion/neon-core";
import * as tsm from "ts-morph";
// import { convertStatement } from "./convert";
import * as path from 'path'
import { ScriptBuilder } from "./ScriptBuilder";
import { convertStatement } from "./convert";
import { DebugInfo, Method as DebugInfoMethod, SequencePoint } from "./debugInfo";
import { ContractType, ContractTypeKind, PrimitiveContractType, PrimitiveType, tsTypeToContractType } from "./contractType";
import { isVoidLike } from "./utils";

// https://github.com/CityOfZion/neon-js/issues/858
const DEFAULT_ADDRESS_VALUE = 53;

export class CompileError extends Error {
    constructor(
        message: string,
        public readonly node: tsm.Node
    ) {
        super(message);
    }
}

export interface CompileOptions {
    project: tsm.Project,
    optimize?: boolean,
    inline?: boolean,
    addressVersion?: number
};

export interface CompilationContext {
    project: tsm.Project,
    options: Required<Omit<CompileOptions, 'project'>>,
    name?: string,
    builtins?: Builtins,
    operations?: Array<OperationContext>,
    staticFields?: Array<StaticField>,
    diagnostics: Array<tsm.ts.Diagnostic>,
    artifacts?: CompilationArtifacts
}

export interface CompilationArtifacts {
    nef: sc.NEF,
    manifest: sc.ContractManifest,
    debugInfo: DebugInfo
}

export interface SysCall {
    syscall: string,
}

// adding type alias so we can add other types of VM calls later
export type VmCall = SysCall;

export interface Builtins {
    variables: ReadonlyMap<tsm.Symbol, tsm.Symbol>,
    interfaces: ReadonlyMap<tsm.Symbol, Map<tsm.Symbol, VmCall[]>>,
}

export interface OperationContext {
    readonly parent: CompilationContext,
    readonly name: string,
    readonly isPublic: boolean,
    readonly node: tsm.FunctionDeclaration,
    readonly builder: ScriptBuilder
}

export interface StaticField { }

export interface CompileResults {
    diagnostics: Array<tsm.ts.Diagnostic>,
    artifacts?: CompilationArtifacts,
    context: Omit<CompilationContext, 'diagnostics' | 'artifacts'>

}

function compile(options: CompileOptions): CompileResults {

    const context: CompilationContext = {
        project: options.project,
        options: {
            addressVersion: options.addressVersion ?? DEFAULT_ADDRESS_VALUE,
            inline: options.inline ?? false,
            optimize: options.optimize ?? false,
        },
        diagnostics: []
    };

    type CompilePass = (context: CompilationContext) => void;
    const passes: Array<CompilePass> = [
        resolveDeclarationsPass,
        processFunctionsPass,
        collectArtifactsPass,
    ];

    for (const pass of passes) {
        try {
            pass(context);
        } catch (error) {
            const messageText = error instanceof Error
                ? error.message
                : "unknown error";
            const node = error instanceof CompileError
                ? error.node
                : undefined;
            if (!context.diagnostics) { context.diagnostics = []; }
            context.diagnostics.push({
                category: tsm.ts.DiagnosticCategory.Error,
                code: 0,
                file: node?.getSourceFile().compilerNode,
                length: node
                    ? node.getEnd() - node.getPos()
                    : undefined,
                messageText,
                start: node?.getPos(),
                source: node?.print()
            });
        }

        if (context.diagnostics?.some(d => d.category == tsm.ts.DiagnosticCategory.Error)) {
            break;
        }
    }

    return {
        diagnostics: context.diagnostics,
        artifacts: context.artifacts,
        context
    };
}

function resolveDeclarationsPass(context: CompilationContext): void {

    // TODO: move this to a JSON file at some point
    const storageBuiltin = new Map<string, VmCall[]>([
        ["currentContext", [{ syscall: "System.Storage.GetContext" }]],
        ["get", [{ syscall: "System.Storage.Get" }]],
        ["put", [{ syscall: "System.Storage.Put" }]]
    ]);

    const builtinInterfaces = new Map([
        ["StorageConstructor", storageBuiltin]
    ]);

    const interfaces = new Map<tsm.Symbol, Map<tsm.Symbol, VmCall[]>>();
    const variables = new Map<tsm.Symbol, tsm.Symbol>();

    for (const src of context.project.getSourceFiles()) {
        if (!src.isDeclarationFile()) continue;

        src.forEachChild(node => {
            if (node.isKind(tsm.ts.SyntaxKind.InterfaceDeclaration)) {
                const symbol = node.getSymbol();
                if (!symbol) return;
                const iface = builtinInterfaces.get(symbol.getName());
                if (!iface) return;
                const members = new Map<tsm.Symbol, VmCall[]>();
                for (const member of node.getMembers()) {
                    const memberSymbol = member.getSymbol();
                    if (!memberSymbol) return;
                    const calls = iface.get(memberSymbol.getName());
                    if (calls && calls.length > 0) {
                        members.set(memberSymbol, calls);
                    }
                }
                interfaces.set(symbol, members);
            }
            if (node.isKind(tsm.ts.SyntaxKind.VariableStatement)) {
                for (const decl of node.getDeclarations()) {
                    const symbol = decl.getSymbol()
                    const typeSymbol = decl.getType().getSymbol();
                    if (symbol && typeSymbol) {
                        variables.set(symbol, typeSymbol);
                    }
                }
            }
        });
    }

    context.builtins = { interfaces, variables }
}

function processFunctionsPass(context: CompilationContext): void {
    for (const src of context.project.getSourceFiles()) {
        if (src.isDeclarationFile()) continue;
        src.forEachChild(node => {
            if (tsm.Node.isFunctionDeclaration(node)) {
                const name = node.getName();
                const _export = node.getExportKeyword();
                if (!name) { return; }
                const opCtx: OperationContext = {
                    parent: context,
                    name,
                    isPublic: !!_export,
                    node,
                    builder: new ScriptBuilder(),
                };
                if (!context.operations) { context.operations = []; }
                context.operations.push(opCtx);

                const paramCount = node.getParameters().length;
                const localCount = 0;
                if (localCount > 0 || paramCount > 0) {
                    opCtx.builder.push(sc.OpCode.INITSLOT, [localCount, paramCount]);
                }

                const body = node.getBodyOrThrow();
                if (tsm.Node.isStatement(body)) {
                    convertStatement(body, opCtx)
                } else {
                    throw new CompileError(`Unexpected body kind ${body.getKindName()}`, body);
                }
            }
        })
    }
}

interface MethodInfo {
    methodDef?: sc.ContractMethodDefinition,
    debug: DebugInfoMethod,
}

function isNotNullOrUndefined<T extends Object>(input: null | undefined | T): input is T {
    return input != null;
}

function collectArtifactsPass(context: CompilationContext): void {
    let fullScript = Buffer.from([]);
    const name = context.name ?? "Test Contract";
    const methods = new Array<MethodInfo>();

    for (const op of context.operations ?? []) {
        const { script, sequencePoints } = op.builder.compile(fullScript.length);
        const methodDef = toMethodDef(op.node, fullScript.length);
        const debug = toDebugInfoMethod(op, fullScript.length, script.length, sequencePoints);
        methods.push({ methodDef, debug });
        fullScript = Buffer.concat([fullScript, script]);
    }

    const nef = new sc.NEF({
        compiler: "neo-devpack-ts",
        script: Buffer.from(fullScript).toString("hex"),
    })

    const manifest = new sc.ContractManifest({
        name: name,
        abi: new sc.ContractAbi({
            methods: methods.map(m => m.methodDef).filter(isNotNullOrUndefined)
        })
    });

    const debugInfo: DebugInfo = {
        contractHash: u.hash160(nef.script),
        checksum: nef.checksum,
        methods: methods.map(m => m.debug),
    }

    context.artifacts = { nef, manifest, debugInfo }
}

function toDebugInfoMethod(
    op: OperationContext,
    offset: number,
    length: number,
    sequencePoints: SequencePoint[],
): DebugInfoMethod {
    const parameters = op.node.getParameters().map((p, index) => ({
        name: p.getName(),
        index,
        type: tsTypeToContractType(p.getType()),
    }));
    const returnType = op.node.getReturnType();

    return {
        name: op.name,
        range: {
            start: offset,
            end: offset + length - 1
        },
        parameters,
        returnType: isVoidLike(returnType)
            ? undefined
            : tsTypeToContractType(returnType),
        sequencePoints
    }
}

export function convertContractType(type: tsm.Type): sc.ContractParamType;
export function convertContractType(type: ContractType): sc.ContractParamType;
export function convertContractType(type: ContractType | tsm.Type): sc.ContractParamType {
    if (type instanceof tsm.Type) { type = tsTypeToContractType(type); }
    switch (type.kind) {
        case ContractTypeKind.Array: return sc.ContractParamType.Array;
        case ContractTypeKind.Interop: return sc.ContractParamType.InteropInterface;
        case ContractTypeKind.Map: return sc.ContractParamType.Map;
        case ContractTypeKind.Struct: return sc.ContractParamType.Array;
        case ContractTypeKind.Unspecified: return sc.ContractParamType.Any;
        case ContractTypeKind.Primitive: {
            const primitive = type as PrimitiveContractType;
            switch (primitive.type) {
                case PrimitiveType.Address: return sc.ContractParamType.Hash160;
                case PrimitiveType.Boolean: return sc.ContractParamType.Boolean;
                case PrimitiveType.ByteArray: return sc.ContractParamType.ByteArray;
                case PrimitiveType.Hash160: return sc.ContractParamType.Hash160;
                case PrimitiveType.Hash256: return sc.ContractParamType.Hash256;
                case PrimitiveType.Integer: return sc.ContractParamType.Integer;
                case PrimitiveType.PublicKey: return sc.ContractParamType.PublicKey;
                case PrimitiveType.Signature: return sc.ContractParamType.Signature;
                case PrimitiveType.String: return sc.ContractParamType.String;
                default: throw new Error(`Unrecognized PrimitiveType ${primitive.type}`);
            }
        }
        default: throw new Error(`Unrecognized ContractTypeKind ${type.kind}`);
    }
}

function toMethodDef(node: tsm.FunctionDeclaration, offset: number): sc.ContractMethodDefinition | undefined {

    if (!node.hasExportKeyword()) return undefined;
    const returnType = node.getReturnType();
    return new sc.ContractMethodDefinition({
        name: node.getNameOrThrow(),
        offset,
        parameters: node.getParameters().map(p => ({
            name: p.getName(),
            type: convertContractType(p.getType())
        })),
        returnType: isVoidLike(returnType)
            ? sc.ContractParamType.Void
            : convertContractType(returnType)
    });
}

function printDiagnostic(diags: tsm.ts.Diagnostic[]) {
    const formatHost: tsm.ts.FormatDiagnosticsHost = {
        getCurrentDirectory: () => tsm.ts.sys.getCurrentDirectory(),
        getNewLine: () => tsm.ts.sys.newLine,
        getCanonicalFileName: (fileName: string) => tsm.ts.sys.useCaseSensitiveFileNames
            ? fileName : fileName.toLowerCase()
    }

    const msg = tsm.ts.formatDiagnosticsWithColorAndContext(diags, formatHost);
    console.log(msg);
}

function dumpOperations(operations?: OperationContext[]) {
    for (const op of operations ?? []) {
        console.log(` ${op.isPublic ? 'public ' : ''}${op.name}`);
        for (const { instruction, sequencePoint } of op.builder.instructions) {
            const operand = instruction.operand ? Buffer.from(instruction.operand).toString('hex') : "";
            let msg = `  ${sc.OpCode[instruction.opCode]} ${operand}`
            if (sequencePoint) {
                msg += " # " + sequencePoint.print();
            }
            console.log(msg)
        }
    }
}

function dumpNef(nef: sc.NEF, debugInfo?: DebugInfo) {

    const starts = new Map(debugInfo?.methods?.map(m => [m.range.start, m]))
    const ends = new Map(debugInfo?.methods?.map(m => [m.range.end, m]));
    // const points = new Map(debugInfo?.methods
    //     ?.flatMap(m => m.sequencePoints)
    //     .filter(isNotNullOrUndefined)
    //     .map(sp => [sp.address, sp]));

    const opTokens = sc.OpToken.fromScript(nef.script); 
    let address = 0;
    for (const token of opTokens) {
        const s = starts.get(address);
        if (s) { console.log(`# Method Start ${s.name}`); }
        console.log(`${address.toString().padStart(3)}: ${token.prettyPrint()}`);
        const e = ends.get(address);
        if (e) { console.log(`# Method End ${e.name}`); }

        const size = token.toScript().length / 2
        address += size;
    }
}

function testCompile(source: string, filename: string = "contract.ts") {

    const project = new tsm.Project({
        compilerOptions: {
            experimentalDecorators: true,
            target: tsm.ts.ScriptTarget.ES5
        }
    });
    project.createSourceFile(filename, source);
    project.resolveSourceFileDependencies();

    // console.time('getPreEmitDiagnostics');
    const diagnostics = project.getPreEmitDiagnostics();
    // console.timeEnd('getPreEmitDiagnostics')

    if (diagnostics.length > 0) {
        printDiagnostic(diagnostics.map(d => d.compilerObject));
    } else {
        const results = compile({ project });
        if (results.diagnostics.length > 0) {
            printDiagnostic(results.diagnostics);
        } else {
            if (results.artifacts?.nef) {
                dumpNef(results.artifacts.nef, results.artifacts.debugInfo);
            } else {
                dumpOperations(results.context.operations);
            }
        }
    }
}

const file = path.basename(process.argv[1]);
if (file === "compiler.js") {
    console.log('test compile');

    const contractSource = /*javascript*/`
import * as neo from '@neo-project/neo-contract-framework';

export function getValue() { 
    return neo.Storage.get(neo.Storage.currentContext, [0x00]); 
}

export function setValue(value: string) { 
    neo.Storage.put(neo.Storage.currentContext, [0x00], value); 
}

export function helloWorld() { return "Hello, World!"; }

export function sayHello(name: string) { return "Hello, " + name + "!"; }
`;

    testCompile(contractSource);
}


