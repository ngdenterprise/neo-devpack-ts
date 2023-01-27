import { sc } from "@cityofzion/neon-core";
import * as tsm from "ts-morph";
import { collectArtifacts } from "./collectArtifacts";
// import { processFunctionDeclarationsPass } from "./passes/processFunctionDeclarations";
import { ConstantSymbolDef, createGlobalScope, FunctionSymbolDef, ReadonlyScope, Scope } from "./scope";
// import { Operation } from "./types";
import { DebugInfo, toJson as debugInfoToJson } from "./types/DebugInfo";
import { createDiagnostic, toDiagnostic } from "./utils";
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
// import { LocalVariable } from "./types/FunctionBuilder";
import { Console } from "console";
import { create } from "domain";
import { processFunctionDeclaration } from "./passes/processFunctionDeclarations";

// @internal
export const DEFAULT_ADDRESS_VALUE = 53;

export class CompileError extends Error {
    constructor(
        message: string,
        public readonly node: tsm.Node
    ) {
        super(message);
    }
}

export interface CompileOptions {
    readonly project: tsm.Project;
    readonly addressVersion?: number;
    readonly inline?: boolean;
    readonly optimize?: boolean;
}

export interface CompileArtifacts {
    nef: sc.NEF;
    manifest: sc.ContractManifest;
    debugInfo: DebugInfo;
}

export interface CompileContext {
    readonly diagnostics: Array<tsm.ts.Diagnostic>;
    readonly globals: ReadonlyScope;
    readonly options: Readonly<Required<Omit<CompileOptions, 'project'>>>;
    readonly project: tsm.Project;
    // readonly functions: Array<FunctionContext>;
}

// export interface FunctionContext {
//     readonly node: tsm.FunctionDeclaration;
//     operations?: ReadonlyArray<Operation>;
//     locals?: ReadonlyArray<LocalVariable>;
// }

function parse(node: tsm.JSDocableNode) {
    for (const doc of node.getJsDocs()) {
        const st = doc.getStructure();
        var i = 0;
    }
}

function parseExtraTag() {

}

const CONTRACT_TAG = "contract";
const EXTRA_TAG = "extra";
const STANDARD_TAG = "standard";
const EVENT_TAG = "event";
const SAFE_TAG = "safe";

// TODO: finish parsing contract tags
function parseContractTag(st: tsm.JSDocStructure, options: ProcessMetadataOptions) {

    const initialTag = st.tags![0];
    if (initialTag.tagName !== CONTRACT_TAG) throw new Error(`parseContractTag ${initialTag.tagName}`);
    const contractName = st.tags![0].text; 
    if (typeof contractName !== 'string' || contractName.length === 0) {
        throw new Error('contract tag must contain a non-empty string');
    } 

    var length = st.tags!.length;
    for (var i = 1; i < length; i++) {
        const tag = st.tags![i];
        const d = tag.tagName;
        const q = tag.text;


    }


}

// not sure yet if I need event tags or if I can just generate these from Runtime.notify calls
function parseEventTag(st: tsm.JSDocStructure, options: ProcessMetadataOptions) {
    const initialTag = st.tags![0];
    if (initialTag.tagName !== EVENT_TAG) throw new Error(`parseEventTag ${initialTag.tagName}`);
    const eventName = st.tags![0].text; 
    if (typeof eventName !== 'string' || eventName.length === 0) {
        throw new Error(`${EVENT_TAG} tag must contain a non-empty string`);
    }

    var length = st.tags!.length;
    for (var i = 1; i < length; i++) {
        const tag = st.tags![i];
        const d = tag.tagName;
        const q = tag.text;


    }


}


interface ProcessMetadataOptions {
    diagnostics: Array<tsm.ts.Diagnostic> 
}

function processMetadataNode(node: tsm.JSDoc, options: ProcessMetadataOptions) {
    const st = node.getStructure();
    if (st.tags && st.tags.length > 0) {
        const tag = st.tags[0];
        switch (tag.tagName) {
            case CONTRACT_TAG:
                parseContractTag(st, options);
                break;
            case EVENT_TAG:
                parseEventTag(st, options);
                break;
            case SAFE_TAG: {
                const parent = node.getParentOrThrow();
                if (!tsm.Node.isFunctionDeclaration(parent)) {
                    options.diagnostics.push(createDiagnostic(
                        `"safe" JSDoc tag on ${parent.getKindName()} node`, 
                        { 
                            node, 
                            category: tsm.ts.DiagnosticCategory.Warning
                        }));
                }
                break;
            }
            default:
                options.diagnostics.push(createDiagnostic(
                    `unrecognized JSDoc tag ${tag.tagName}`, 
                    { 
                        node, 
                        category: tsm.ts.DiagnosticCategory.Warning
                    }));
                break;
        }
    }
}

function processMetadata(project: tsm.Project, options: ProcessMetadataOptions) {
    for (const src of project.getSourceFiles()) {
        if (src.isDeclarationFile()) continue;
        src.forEachChild(node => {
            if (tsm.Node.isJSDocable(node)) {
                for (const doc of node.getJsDocs()) {
                    processMetadataNode(doc, options);
                }
            }
        });
    }

}

export function compile(options: CompileOptions) {

    const { project } = options;

    const diagnostics: Array<tsm.ts.Diagnostic> = [];

    // processMetadata(project, { diagnostics });
    
    // const context: CompileContext = {
    //     diagnostics: [],
    //     globals,
    //     options: {
    //         addressVersion: options.addressVersion ?? DEFAULT_ADDRESS_VALUE,
    //         inline: options.inline ?? false,
    //         optimize: options.optimize ?? false,
    //     },
    //     project: options.project,
    //     // functions: []
    // };

    const globals = createGlobalScope(project);
     for (const sym of globals.symbols) {
        if (sym instanceof FunctionSymbolDef) {
            processFunctionDeclaration(sym);
        }
    }

    // for (const src of project.getSourceFiles()) {
    //     if (src.isDeclarationFile()) continue;
    //     src.forEachChild(node => {
    //         if (tsm.Node.isJSDocable(node)) {
    //             for (const jsDoc of node.getJsDocs()) {
    //                 const ss = jsDoc.getStructure();
    //                 for (const tag of jsDoc.getTags()) {
    //                     const s = tag.getStructure()
    //                     var i = 0;
    //                 }
    //             }
    //         }
    //     });
    // }



    // throw new Error("Not Implemented")
    // const globals = createGlobalScope(options.project);

    // // type CompilePass = (context: CompileContext) => void;
    // const passes = [
    //     processFunctionDeclarationsPass,
    // ] as const;

    // for (const pass of passes) {
    //     try {
    //         pass(context);
    //     } catch (error) {
    //         context.diagnostics.push(toDiagnostic(error));
    //     }

    //     if (context.diagnostics.some(d => d.category == tsm.ts.DiagnosticCategory.Error)) {
    //         break;
    //     }
    // }

    // let artifacts: CompileArtifacts | undefined; 
    // try {
    //     artifacts = collectArtifacts(context);
    // } catch (error) {
    //     context.diagnostics.push(toDiagnostic(error));
    // }

    // return {
    //     diagnostics: context.diagnostics,
    //     artifacts,
    //     context
    // };
}

async function exists(rootPath: fs.PathLike) {
    try {
        await fsp.access(rootPath);
        return true;
    } catch {
        return false;
    }
}

export interface SaveArtifactsOptions {
    artifacts: CompileArtifacts; 
    rootPath: string; 
    baseName?: string;
    sourceDir?: string;
}

export async function saveArtifacts({ artifacts, rootPath, baseName = "contract", sourceDir }: SaveArtifactsOptions) {
    if (await exists(rootPath) === false) { await fsp.mkdir(rootPath); }

    const nefPath = path.join(rootPath, baseName + ".nef")
    const manifestPath = path.join(rootPath, baseName + ".manifest.json");
    const debugInfoPath = path.join(rootPath, baseName + ".debug.json");

    const {nef, manifest, debugInfo} = artifacts;
    const _nef = Buffer.from(nef.serialize(), 'hex');
    const _manifest = JSON.stringify(manifest.toJson(), null, 4);
    const _debugInfo = JSON.stringify(debugInfoToJson(debugInfo, nef, sourceDir), null, 4);

    await Promise.all([
        fsp.writeFile(nefPath, _nef), 
        fsp.writeFile(manifestPath, _manifest),
        fsp.writeFile(debugInfoPath, _debugInfo)]);
}