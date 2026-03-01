import { ASTLiteralNode, ASTNode, ASTProcedureNode, ASTSExprNode } from "../parser/ast.js";
import { RuntimeSymbol, TokenMetadata, Token, TokenType, TokenVoid } from "../parser/token.js";

type ANFEnv = Map<number, RuntimeSymbol>;

let __next_anf_sym_id = 0;

function newSymbol(base: string): RuntimeSymbol {
    return {
        id: __next_anf_sym_id++,
        name: base,
    };
}

export interface ANFBase {
    meta?: TokenMetadata
}

export class ANFVar implements ANFBase {
    constructor(
        public sym: RuntimeSymbol,
        public meta?: TokenMetadata
    ) { }
}

export class ANFLiteral implements ANFBase {
    constructor(
        public value: Token,
        public meta?: TokenMetadata
    ) { }
}

export class ANFLambda implements ANFBase {
    constructor(
        public params: RuntimeSymbol[],
        public body: ANFExpr,
        public meta?: TokenMetadata
    ) { }
}

export class ANFLet implements ANFBase {
    constructor(
        public sym: RuntimeSymbol,
        public value: ANFExpr,
        public body: ANFExpr,
        public meta?: TokenMetadata
    ) { }
}

export class ANFApp implements ANFBase {
    constructor(
        public callee: ANFAtom,
        public args: ANFAtom[],
        public meta?: TokenMetadata
    ) { }
}

export class ANFIf implements ANFBase {
    constructor(
        public cond: ANFAtom,
        public then_branch: ANFExpr,
        public else_branch: ANFExpr,
        public meta?: TokenMetadata
    ) { }
}

export class ANFProgram {
    constructor(
        public body: ANFExpr,
        public name: string = ""
    ) {
        if (body instanceof ANFApp) {
            const temp = newSymbol("");
            return new ANFProgram(
                new ANFLet(temp, body, new ANFVar(temp)),
                name,
            );
        }
    }
}

export type ANFAtom =
    | ANFVar
    | ANFLiteral
    | ANFLambda;

export type ANFExpr =
    | ANFAtom
    | ANFLet
    | ANFIf
    | ANFApp;

export type ANF =
    | ANFAtom
    | ANFExpr;

function isCall(node: ASTNode) {
    if (!(node instanceof ASTSExprNode))
        return false;

    const op_node = node.first;

    if (!(op_node instanceof ASTLiteralNode))
        return false;

    if (op_node.tok.type !== TokenType.IDENT)
        return false;

    return true;
}

function isLambda(node: ASTNode) {
    if (!isCall(node)) return false;

    const lambda = node as ASTSExprNode;

    return (
        (lambda.first as ASTLiteralNode).tok.literal === "lambda" ||
        (lambda.first as ASTLiteralNode).tok.literal === "λ"
    );
}

function isIf(node: ASTNode) {
    if (!isCall(node)) return false;

    const if_node = node as ASTSExprNode;

    return (
        (if_node.first as ASTLiteralNode).tok.literal === "if"
    );
}

function wrapLets(lets: ANFLet[], body: ANFExpr): ANFExpr {
    return lets.reduceRight(
        (acc, l) => new ANFLet(l.sym, l.value, acc, l.meta),
        body
    );
}

export class ANFCompiler {
    static compile(node: ASTNode, intern_table: Map<string, RuntimeSymbol>): ANFExpr {
        let env: ANFEnv = new Map();

        for (const [_, sym] of intern_table) {
            env.set(sym.id, sym);
            __next_anf_sym_id = Math.max(__next_anf_sym_id, sym.id + 1);
        }

        return this.makeANFExpr(node, env);
    }

    static makeANFExpr(node: ASTNode, env: ANFEnv): ANFExpr {
        if (isIf(node)) {
            const if_node = node as ASTSExprNode;

            const [cond, then_branch, else_branch] = if_node.elements.slice(1);

            const cond_atomic = ANFCompiler.makeANFAtom(cond, env);

            return wrapLets(
                cond_atomic.lets,
                new ANFIf(
                    cond_atomic.atom,
                    ANFCompiler.makeANFExpr(then_branch, env),
                    ANFCompiler.makeANFExpr(else_branch, env),
                    if_node.meta
                )
            );

        } else if (node instanceof ASTLiteralNode) {
            if (node.tok.type === TokenType.IDENT) {
                const original = node.tok.value as RuntimeSymbol;

                if (!env.has(original.id)) {
                    throw new Error(`Unbound identifier: ${original.name}`);
                }

                return new ANFVar(env.get(original.id)!, node.meta);
            } else {
                return new ANFLiteral(node.tok, node.meta);
            }

        } else if (node instanceof ASTSExprNode) {
            const op = node.first;
            const args = node.rest;

            const op_atomic = ANFCompiler.makeANFAtom(op, env);
            const args_atomic = args.map(a => ANFCompiler.makeANFAtom(a, env));

            return wrapLets(
                [...op_atomic.lets, ...args_atomic.flatMap(a => a.lets)],
                new ANFApp(op_atomic.atom, args_atomic.flatMap(a => a.atom))
            );

        } else if (node instanceof ASTProcedureNode) {
            return ANFCompiler.makeANFAtom(node, env).atom;
        }

        throw new Error("Failed to build ANF. Unrecognized ASTNode type.");
    }

    static makeANFAtom(node: ASTNode, env: ANFEnv): { atom: ANFAtom, lets: ANFLet[] } {
        if (isIf(node)) {
            const temp = newSymbol("");

            return {
                atom: new ANFVar(temp),
                lets: [
                    new ANFLet(temp, ANFCompiler.makeANFExpr(node, env), null!, node.meta)
                ]
            };

        } else if (isLambda(node)) {
            const lambda_node = node as ASTSExprNode;

            const params_list = lambda_node.rest[0];
            const body = lambda_node.rest.slice(1);

            if (!(params_list instanceof ASTSExprNode))
                throw new Error(`lambda: bad syntax; expected parameters to be a list`);

            const new_env = new Map(env);

            const params = params_list.elements.map(p => {
                if (!(p instanceof ASTLiteralNode) || p.tok.type !== TokenType.IDENT)
                    throw new Error("lambda: bad syntax; parameters must be identifiers");

                const original = p.tok.value as RuntimeSymbol;
                const new_sym = newSymbol(original.name);
                new_env.set(original.id, new_sym);
                return new_sym;
            });

            const lambda = new ASTProcedureNode(params, body);

            const body_expr = ANFCompiler.makeANFSequence(lambda.body, new_env);
            return { atom: new ANFLambda(lambda.params, body_expr, lambda_node.meta), lets: [] };

        } else if (node instanceof ASTLiteralNode) {
            if (node.tok.type === TokenType.IDENT) {
                const original = node.tok.value as RuntimeSymbol;

                if (!env.has(original.id)) {
                    throw new Error(`Unbound identifier: ${original.name}`);
                }

                return {
                    atom: new ANFVar(env.get(original.id)!, node.meta),
                    lets: [],
                };
            } else {
                return {
                    atom: new ANFLiteral(node.tok, node.meta),
                    lets: [],
                };
            }

        } else if (node instanceof ASTSExprNode) {
            const op = node.first;
            const args = node.rest;

            const op_atomic = ANFCompiler.makeANFAtom(op, env);
            const args_atomic = args.map(a => ANFCompiler.makeANFAtom(a, env));

            const temp = newSymbol("");

            const app = new ANFApp(
                op_atomic.atom,
                args_atomic.map(a => a.atom),
                node.meta
            );

            return {
                atom: new ANFVar(temp, node.meta),
                lets: [
                    ...op_atomic.lets,
                    ...args_atomic.flatMap(a => a.lets),
                    new ANFLet(temp, app, null!, node.meta)
                ]
            };
        } else if (node instanceof ASTProcedureNode) {
            const new_env = new Map(env);

            const new_params = node.params.map(original => {
                const new_sym = newSymbol(original.name);
                new_env.set(original.id, new_sym);
                return new_sym;
            });

            const body_expr = ANFCompiler.makeANFSequence(node.body, new_env);

            return {
                atom: new ANFLambda(new_params, body_expr, node.meta),
                lets: []
            };
        }

        throw new Error("Failed to build ANF. Unrecognized ASTNode type.");
    }

    static makeANFSequence(nodes: ASTNode[], env: ANFEnv): ANFExpr {
        if (nodes.length === 1)
            return ANFCompiler.makeANFExpr(nodes[0], env);

        const first = nodes[0];
        const rest = nodes.slice(1);

        const temp = newSymbol("");

        return new ANFLet(
            temp,
            ANFCompiler.makeANFExpr(first, env),
            ANFCompiler.makeANFSequence(rest, env),
            first.meta
        );
    }

    static chainANFExprs(exprs: ANFExpr[]): ANFExpr {
        if (exprs.length === 0) return new ANFLiteral(TokenVoid());
        if (exprs.length === 1) return exprs[0];

        const temp = newSymbol("");
        return new ANFLet(temp, exprs[0], ANFCompiler.chainANFExprs(exprs.slice(1)));
    }
};

