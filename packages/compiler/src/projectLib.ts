import * as tsm from "ts-morph";
import { flow, identity, pipe } from 'fp-ts/function';
import * as ROA from 'fp-ts/ReadonlyArray';
import * as RNEA from 'fp-ts/ReadonlyNonEmptyArray';
import * as E from 'fp-ts/Either';
import * as O from 'fp-ts/Option';
import * as S from 'fp-ts/State';
import * as ROS from 'fp-ts/ReadonlySet';
import * as M from 'fp-ts/Monoid';
import * as FP from 'fp-ts';
import { JsonRecord } from "fp-ts/Json";
import { posix } from 'path';

import { createDiagnostic } from "./utils";
import { CompilerState } from "./types/CompileOptions";
import * as TS from './utility/TS'

const isFunctionDeclaration = O.fromPredicate(tsm.Node.isFunctionDeclaration);
const isInterfaceDeclaration = O.fromPredicate(tsm.Node.isInterfaceDeclaration);
const isVariableStatement = O.fromPredicate(tsm.Node.isVariableStatement);
const isModuleDeclaration = O.fromPredicate(tsm.Node.isModuleDeclaration);
const isEnumDeclaration = O.fromPredicate(tsm.Node.isEnumDeclaration);
const getVariableDeclarations = (node: tsm.VariableStatement) => node.getDeclarations();
const getModuleBody = (node: tsm.ModuleDeclaration) => O.fromNullable(node.getBody());

export type LibraryDeclarations = {
    readonly enums: readonly tsm.EnumDeclaration[],
    readonly functions: readonly tsm.FunctionDeclaration[],
    readonly interfaces: readonly tsm.InterfaceDeclaration[],
    readonly variables: readonly tsm.VariableDeclaration[],
}

const parseDeclarations =
    (children: ReadonlyArray<tsm.Node>): LibraryDeclarations => {
        const enums = pipe(
            children,
            ROA.filterMap(isEnumDeclaration),
        );
        const functions = pipe(
            children,
            ROA.filterMap(isFunctionDeclaration)
        );
        const interfaces = pipe(
            children,
            ROA.filterMap(isInterfaceDeclaration)
        );
        const variables = pipe(
            children,
            ROA.filterMap(isVariableStatement),
            ROA.chain(getVariableDeclarations)
        );

        return { enums, functions, interfaces, variables, }
    }

const libDeclMonoid: M.Monoid<LibraryDeclarations> = {
    concat: (x, y) => ({
        enums: ROA.concat(y.enums)(x.enums),
        functions: ROA.concat(y.functions)(x.functions),
        interfaces: ROA.concat(y.interfaces)(x.interfaces),
        variables: ROA.concat(y.variables)(x.variables),
    }),
    empty: {
        enums: ROA.empty,
        functions: ROA.empty,
        interfaces: ROA.empty,
        variables: ROA.empty
    }
}

const parseLibrarySourceFile =
    (resolver: Resolver) =>
        (src: tsm.SourceFile): S.State<LibraryDeclarations, ReadonlyArray<E.Either<string, tsm.SourceFile>>> =>
            declarations => {
                const children = pipe(src, TS.getChildren);
                let childDecls = parseDeclarations(children);

                const globalModules = pipe(
                    children,
                    ROA.filterMap(isModuleDeclaration),
                    ROA.filter(m => m.getDeclarationKind() === tsm.ModuleDeclarationKind.Global)
                );

                for (const module of globalModules) {
                    const modDecls = pipe(
                        module,
                        getModuleBody,
                        O.map(TS.getChildren),
                        O.map(parseDeclarations),
                        E.fromOption(
                            () => `${posix.basename(src.getFilePath())} global module`
                        )
                    )

                    // if module.getBody returns undefined, exit without
                    // including any declarations defined in the current file
                    if (E.isLeft(modDecls)) return [ROA.of(modDecls), declarations];
                    childDecls = libDeclMonoid.concat(childDecls, modDecls.right);
                }

                const libs = pipe(
                    src.getLibReferenceDirectives(),
                    ROA.map(l => l.getFileName()));
                const types = pipe(
                    src.getTypeReferenceDirectives(),
                    ROA.map(t => t.getFileName()));

                return [
                    resolveReferences(resolver)(libs, types),
                    libDeclMonoid.concat(childDecls, declarations)
                ];
            }

const LIB_PATH = `/node_modules/typescript/lib/`;

interface Resolver {
    resolveLib(lib: string): E.Either<string, tsm.SourceFile>,
    resolveTypes(types: string): E.Either<string, tsm.SourceFile>,
}

const isJsonRecord = (json: FP.json.Json): json is JsonRecord =>
    json !== null && typeof json === 'object' && !(json instanceof Array)

const isJsonString = (json: FP.json.Json): json is string => typeof json === 'string'

function makeResolver(project: tsm.Project): Resolver {

    const fs = project.getFileSystem();
    const getSourceFile = (path: string) => pipe(project.getSourceFile(path), O.fromNullable);
    const getFile = (path: string) => fs.fileExistsSync(path) ? O.some(fs.readFileSync(path)) : O.none;
    const fileExists = (path: string): O.Option<string> => fs.fileExistsSync(path) ? O.some(path) : O.none;

    const resolveLib = (lib: string) =>
        pipe(
            LIB_PATH + lib,
            getSourceFile,
            O.alt(() => pipe(LIB_PATH + `lib.${lib}.d.ts`, getSourceFile)),
            E.fromOption(() => `${lib} library`)
        )

    function resolveTypes(types: string) {
        return pipe(
            // look in node_modules/@types for types package first
            `/node_modules/@types/${types}/package.json`,
            fileExists,
            // look in node_modules/ for types package if doesn't exist under @types 
            O.alt(() => pipe(`/node_modules/${types}/package.json`, fileExists)),
            O.chain(packagepath => {
                // load package.json file at packagepath, parse the JSON
                // and cast it to a JsonRecord (aka an object)
                return pipe(
                    packagepath,
                    getFile,
                    O.chain(flow(FP.json.parse, O.fromEither)),
                    O.chain(O.fromPredicate(isJsonRecord)),
                    O.bindTo('$package'),
                    // look in typings and types properties for relative path
                    // to declarations file
                    O.chain(({ $package }) => pipe(
                        $package,
                        FP.record.lookup('typings'),
                        O.alt(() => pipe(
                            $package,
                            FP.record.lookup('types')
                        ))
                    )),
                    // cast JSON value to string
                    O.chain(O.fromPredicate(isJsonString)),
                    // resolve relative path to absolute path and load as source
                    O.map(path => posix.resolve(posix.dirname(packagepath), path)),
                    O.chain(getSourceFile)
                );
            }),
            E.fromOption(() => `${types} types`)
        );
    }

    return {
        resolveLib,
        resolveTypes
    }
}

const resolveReferences =
    (resolver: Resolver) =>
        (libs: ReadonlyArray<string>, types: ReadonlyArray<string>) => {
            const resolvedLibs = pipe(libs, ROA.map(resolver.resolveLib));
            const resolbedTypes = pipe(types, ROA.map(resolver.resolveTypes));
            return ROA.concat(resolvedLibs)(resolbedTypes);
        }

export const parseProjectLibrary =
    (project: tsm.Project): CompilerState<LibraryDeclarations> =>
        diagnostics => {
            const resolver = makeResolver(project);
            const $parseLibrarySourceFile = parseLibrarySourceFile(resolver);

            const opts = project.compilerOptions.get();
            let { left: failures, right: sources } = pipe(
                opts,
                opts => resolveReferences(resolver)(opts.lib ?? [], opts.types ?? []),
                ROA.partitionMap(identity)
            )
            let parsed: ReadonlySet<string> = ROS.empty;
            let declarations = libDeclMonoid.empty;

            while (ROA.isNonEmpty(sources)) {

                const head = RNEA.head(sources);
                sources = RNEA.tail(sources);

                const headPath = head.getFilePath();
                if (ROS.elem(FP.string.Eq)(headPath)(parsed)) continue;
                parsed = ROS.insert(FP.string.Eq)(headPath)(parsed);

                let results;
                [results, declarations] = $parseLibrarySourceFile(head)(declarations);

                const { left: $failures, right: $sources } = pipe(results, ROA.partitionMap(identity));
                failures = ROA.concat($failures)(failures);
                sources = ROA.concat($sources)(sources);
            }

            return [declarations, ROA.concat(failures.map(f => createDiagnostic(f)))(diagnostics)];
        }
