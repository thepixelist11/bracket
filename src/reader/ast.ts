/* Bracket's AST is used to represent source code parsed by the Reader, and
 * later that which has been expanded by the macro expander. Tokens are
 * consumed during parsing and do not appear in the runtime or later IRs.
 *
 * Each AST node contains a `kind` property whose value is a member of the
 * `ASTKind` enum. Nodes may aditionally include properties specific to their
 * structure, as described below. Nodes may also contain an optional `meta`
 * parameter, typically derived from source tokens, which contains metadata
 * such as source location or comments. `meta` must never be required for
 * evaluation or compilation and exists purely for debugging, tooling, or
 * source reconstruction.
 *
 * The AST represents datums and syntactic forms after reader processing.
 * Certain lexical constructs are normalized to the core AST (Expr) IR by the
 * Analyzer, which are detailed within src/analyzer/expr.ts.
 *
 * The following describes all ASTKinds in Bracket and the associated data:
 *
 * Program -------------- Root node
 *                          Properties:
 *                            body: <Node[]>
 *                            shebang?: <string>
 *
 *                          Program nodes contain a sequence of top-level forms
 *                          parsed from a token stream. If a shebang token
 *                          exists at the start of the token stream, it's value
 *                          will be stored here.
 *
 * Str ------------------ String literal node
 *                          Properties:
 *                            value: <string>
 *
 * Sym ------------------ Symbol literal node
 *                          Properties:
 *                            value: <string>
 *
 * Num ------------------ Numeric literal node
 *                          Properties:
 *                            value: <number>
 *
 * Bool ----------------- Boolean literal node
 *                          Properties:
 *                            value: <boolean>
 *
 * Char ----------------- Character literal node
 *                          Properties:
 *                            value: <string>
 *
 *                          The value must be a single Unicode scalar.
 *
 * Keyword -------------- Keyword node
 *                          Properties:
 *                            value: <string>
 *
 * List ----------------- List node
 *                          Properties:
 *                            elements: <Node[]>
 *
 *                          Produced from delimeted sequences enclosed by
 *                          LParen and RParen tokens. Lists are equivalent to
 *                          S-Expressions and form the primary syntactic
 *                          structure of Bracket.
 *
 * Vector --------------- Vector node
 *                          Properties:
 *                            elements: <Node[]>
 *
 *
 * DottedList ----------- Dotted List node
 *                          Properties:
 *                            head: <Node[]>
 *                            tail: <Node>
 */

import { Position } from "../shared/util/types.js";

export enum ASTKind {
    Program,
    Str,
    Sym,
    Num,
    Bool,
    Char,
    Keyword,
    List,
    Vector,
    DottedList,
}

export type ASTNodeMetadata = Partial<{
    pos: Position;
}> & { [key: string]: unknown };

export interface ASTNodeBase {
    kind: ASTKind;
    meta?: Readonly<ASTNodeMetadata>;
}

export interface ASTProgramNode extends ASTNodeBase {
    kind: ASTKind.Program;
    body: ASTNode[];
    shebang?: string;
}

export interface ASTStrNode extends ASTNodeBase {
    kind: ASTKind.Str;
    value: string;
}

export interface ASTSymNode extends ASTNodeBase {
    kind: ASTKind.Sym;
    value: string;
}

export interface ASTNumNode extends ASTNodeBase {
    kind: ASTKind.Num;
    value: number;
}

export interface ASTBoolNode extends ASTNodeBase {
    kind: ASTKind.Bool;
    value: boolean;
}

export interface ASTCharNode extends ASTNodeBase {
    kind: ASTKind.Char;
    value: string;
}

export interface ASTKeywordNode extends ASTNodeBase {
    kind: ASTKind.Keyword;
    value: string;
}

export interface ASTListNode extends ASTNodeBase {
    kind: ASTKind.List;
    elements: ASTNode[];
}

export interface ASTVectorNode extends ASTNodeBase {
    kind: ASTKind.Vector;
    elements: ASTNode[];
}

export interface ASTDottedListNode extends ASTNodeBase {
    kind: ASTKind.DottedList;
    head: ASTNode[];
    tail: ASTNode;
}

export type ASTNode =
    | ASTProgramNode
    | ASTStrNode
    | ASTSymNode
    | ASTNumNode
    | ASTBoolNode
    | ASTCharNode
    | ASTKeywordNode
    | ASTListNode
    | ASTVectorNode
    | ASTDottedListNode;

export function ASTProgram(
    body: ASTNode[],
    meta: ASTNodeMetadata = {},
): Readonly<ASTProgramNode> {
    return { body, meta, kind: ASTKind.Program } as const;
}

export function ASTStr(
    value: string,
    meta: ASTNodeMetadata = {},
): Readonly<ASTStrNode> {
    return { value, meta, kind: ASTKind.Str } as const;
}

export function ASTSym(
    value: string,
    meta: ASTNodeMetadata = {},
): Readonly<ASTSymNode> {
    return { value, meta, kind: ASTKind.Sym } as const;
}

export function ASTNum(
    value: number,
    meta: ASTNodeMetadata = {},
): Readonly<ASTNumNode> {
    return { value, meta, kind: ASTKind.Num } as const;
}

export function ASTBool(
    value: boolean,
    meta: ASTNodeMetadata = {},
): Readonly<ASTBoolNode> {
    return { value, meta, kind: ASTKind.Bool } as const;
}

export function ASTChar(
    value: string,
    meta: ASTNodeMetadata = {},
): Readonly<ASTCharNode> {
    return { value, meta, kind: ASTKind.Char } as const;
}

export function ASTKeyword(
    value: string,
    meta: ASTNodeMetadata = {},
): Readonly<ASTKeywordNode> {
    return { value, meta, kind: ASTKind.Keyword } as const;
}

export function ASTList(
    elements: ASTNode[],
    meta: ASTNodeMetadata = {},
): Readonly<ASTListNode> {
    return { elements, meta, kind: ASTKind.List } as const;
}

export function ASTVector(
    elements: ASTNode[],
    meta: ASTNodeMetadata = {},
): Readonly<ASTVectorNode> {
    return { elements, meta, kind: ASTKind.Vector } as const;
}

export function ASTDottedList(
    head: ASTNode[],
    tail: ASTNode,
    meta: ASTNodeMetadata = {},
): Readonly<ASTDottedListNode> {
    return { head, tail, meta, kind: ASTKind.DottedList } as const;
}

/*      ASTNode Factory Exhaustiveness Checking       */

type __ExpandMissing<T> = T extends any ? ["Missing token factory:", T] : never;
type __ASTNodeKindNames = Extract<keyof typeof ASTKind, string>;
type __ExpectedFactoryNames = `AST${__ASTNodeKindNames}`;
type __ModuleExports = typeof import("./ast.ts");
type __ActualFactoryNames = Extract<keyof __ModuleExports, `AST${string}`>;
type __MissingFactories = Exclude<__ExpectedFactoryNames, __ActualFactoryNames>;
type __AssertAllFactoriesExist = [__MissingFactories] extends [never]
    ? true
    : __ExpandMissing<__MissingFactories>;
const __assertASTNodeFactories: __AssertAllFactoriesExist = true;
