import { ASTSExprNode, ASTProcedureNode, ASTLiteralNode, ASTProgram, ASTNode } from "./ast.js";
import { TokenType, BOOL_FALSE, BOOL_TRUE, TokenMetadataInjector, Token, RuntimeSymbol } from "./token.js";
import { Lexer } from "./lexer.js";
import { DECOMPILER_CLOSING_ON_NEW_LINE } from "./globals.js";
import { ANFApp, ANFIf, ANFLambda, ANFLet, ANFLiteral, ANFProgram, ANFVar, ANF } from "./anf.js";

interface RenderCtx {
    indent: number;
    indent_step: number;
};

function indentStr(ctx: RenderCtx) {
    return " ".repeat(ctx.indent * ctx.indent_step);
}

function shouldMultiline(parts: string[]) {
    if (parts.length > 3) return true;
    return parts.some(p => p.includes("\n"));
}

function indentLines(str: string, ctx: RenderCtx) {
    return str
        .split("\n")
        .map(line => indentStr(ctx) + line)
        .join("\n");
}

function renderRawList(parts: string[], ctx: RenderCtx) {
    if (!shouldMultiline(parts)) {
        return `(${parts.join(" ")})`;
    }

    const base = indentStr(ctx);
    const inner_ctx = { ...ctx, indent: ctx.indent + 1 };

    const lines = parts.map((p, i) =>
        i === 0
            ? base + "(" + p.replace(/\n/g, "\n" + indentStr(inner_ctx))
            : indentLines(p, inner_ctx)
    );

    if (DECOMPILER_CLOSING_ON_NEW_LINE) {
        return `${lines.join("\n")}\n${base})`;
    } else {
        lines[lines.length - 1] += ")";
        return lines.join("\n");
    }
}

function renderList(head: string, args: string[], ctx: RenderCtx) {
    return renderRawList([head, ...args], ctx);
}

function ASTSExprNodeToSourceCode(ast: ASTSExprNode, ctx: RenderCtx, unexpand_macros: boolean = true) {
    if (unexpand_macros) {
        let unexpanded: string[] | false;

        unexpanded = unexpandAnd(ast, ctx);
        if (unexpanded) return renderList("and", unexpanded, ctx);

        unexpanded = unexpandOr(ast, ctx);
        if (unexpanded) return renderList("or", unexpanded, ctx);

        unexpanded = unexpandVoid(ast);
        if (unexpanded) return `#<void>`;

        unexpanded = unexpandCond(ast);
        if (unexpanded) return renderList("cond", unexpanded, ctx);

        unexpanded = unexpandWhen(ast);
        if (unexpanded) return renderList("when", unexpanded, ctx);
    }

    const inner_ctx = { ...ctx, indent: ctx.indent + 1 };
    const elems = ast.elements.map(e => ASTToSourceCode(e, inner_ctx));

    return renderRawList(elems, ctx);
}

function ASTProcedureNodeToSourceCode(ast: ASTProcedureNode, ctx: RenderCtx) {
    const params = `(${ast.params.map(p => p.name).join(" ")})`;
    const inner_ctx = { ...ctx, indent: ctx.indent + 1 };
    const bodies = ast.body.map(b => ASTToSourceCode(b, inner_ctx));

    return renderRawList(["lambda", params, ...bodies], ctx);
}

function ASTLiteralNodeToSourceCode(ast: ASTLiteralNode, ctx: RenderCtx) {
    const tok = ast.tok;

    switch (tok.type) {
        case TokenType.ERROR:
        case TokenType.EOF:
        case TokenType.ANY:
            return "";

        case TokenType.VOID:
            return "#<void>";

        case TokenType.LPAREN:
            return "(";

        case TokenType.RPAREN:
            return ")";

        case TokenType.IDENT:
        case TokenType.NUM:
            return tok.literal;

        case TokenType.SYM: {
            if (tok.literal.split("").some(ch => Lexer.isIllegalIdentChar(ch)))
                return `'|${tok.literal}|`;
            else
                return `'${tok.literal}`;
        }

        case TokenType.BOOL:
            return tok.literal === BOOL_TRUE ? "#t" : "#f";

        case TokenType.STR:
            return `"${tok.literal}"`;

        case TokenType.CHAR:
            return `#\\${tok.literal}`;

        case TokenType.PROCEDURE: {
            return ASTProcedureNodeToSourceCode(tok.value as ASTProcedureNode, ctx);
        }

        case TokenType.MULTI: {
            const toks = tok.value as Token[];
            if (toks.length === 0) return "(values)";
            let result = "(values ";

            for (const tok of toks)
                result += ASTLiteralNodeToSourceCode(new ASTLiteralNode(tok), ctx) + " ";

            return result.trim() + ")";
        }

        case TokenType.LIST:
        case TokenType.FORM: {
            const toks = tok.value as Token[];
            let result = "'(";
            for (const tok of toks)
                result += ASTLiteralNodeToSourceCode(new ASTLiteralNode(tok), ctx);

            return result.trim() + ")";
        }

        case TokenType.QUOTE:
            return `'`;

        case TokenType.FORM: {
            const toks = tok.value as Token[];
            let result = "(";
            for (const tok of toks)
                result += ASTLiteralNodeToSourceCode(new ASTLiteralNode(tok), ctx);

            return result.trim() + ")";
        }

        case TokenType.META: {
            const meta = Object.entries((tok.value as TokenMetadataInjector).meta);
            let result: string[] = [];

            for (const [key, value] of meta)
                result.push(`#meta ${key} ${typeof value === "number" ? value : '"' + value + '"'}`);

            return result.join("\n");
        }
    }
}

function unexpandAnd(ast: ASTSExprNode, ctx: RenderCtx): string[] | false {
    if (ast.elements.length !== 4) return false;

    const if_node = ast.elements[0];
    const test1 = ast.elements[1];
    const test2 = ast.elements[2];
    const final = ast.elements[3];

    if (if_node.meta?.__macro && if_node.meta.__macro !== "and") return false;

    let params: string[] = [];

    if (!(if_node instanceof ASTLiteralNode) ||
        if_node.tok.type !== TokenType.IDENT ||
        if_node.tok.literal !== "if") return false;

    if (!(final instanceof ASTLiteralNode) ||
        final.tok.type !== TokenType.BOOL ||
        final.tok.literal !== BOOL_FALSE) return false;

    for (const branch of [test1, test2]) {
        if (branch instanceof ASTLiteralNode) {
            params.push(ASTLiteralNodeToSourceCode(branch, ctx));
        } else if (branch instanceof ASTSExprNode) {
            const nested_and = unexpandAnd(branch, ctx);
            if (nested_and)
                params.push(...nested_and);
            else
                params.push(ASTSExprNodeToSourceCode(branch, ctx));
        }
    }

    return params;
}

function unexpandOr(ast: ASTSExprNode, ctx: RenderCtx): string[] | false {
    if (ast.elements.length !== 4) return false;

    const if_node = ast.elements[0];
    const test = ast.elements[1];
    const true_node = ast.elements[2];
    const final = ast.elements[3];

    if (if_node.meta?.__macro && if_node.meta.__macro !== "or") return false;

    let params: string[] = [];

    if (!(if_node instanceof ASTLiteralNode) ||
        if_node.tok.type !== TokenType.IDENT ||
        if_node.tok.literal !== "if") return false;

    if (!(true_node instanceof ASTLiteralNode) ||
        true_node.tok.type !== TokenType.BOOL ||
        true_node.tok.literal !== BOOL_TRUE) return false;

    for (const branch of [test, final]) {
        if (branch instanceof ASTLiteralNode) {
            params.push(ASTLiteralNodeToSourceCode(branch, ctx));
        } else if (branch instanceof ASTSExprNode) {
            const nested_or = unexpandOr(branch, ctx);
            if (nested_or)
                params.push(...nested_or);
            else
                params.push(ASTSExprNodeToSourceCode(branch, ctx));
        }
    }

    return params;
}

function unexpandVoid(ast: ASTSExprNode): string[] | false {
    if (ast.elements.length !== 1) return false;
    if (!(ast.elements[0] instanceof ASTLiteralNode) ||
        ast.elements[0].tok.type !== TokenType.IDENT ||
        ast.elements[0].tok.literal !== "void") return false;

    return [];
}

function unexpandWhen(ast: ASTSExprNode): string[] | false {
    if (ast.elements.length !== 4) return false;

    const if_node = ast.elements[0];
    const test = ast.elements[1];
    const then = ast.elements[2];
    const void_node = ast.elements[3];

    if (if_node.meta?.__macro && if_node.meta.__macro !== "when") return false;

    let params: string[] = [];

    if (!(if_node instanceof ASTLiteralNode) ||
        if_node.tok.type !== TokenType.IDENT ||
        if_node.tok.literal !== "if") return false;

    if (!(void_node instanceof ASTLiteralNode) ||
        void_node.tok.type !== TokenType.VOID ||
        void_node.tok.literal !== "") return false;

    for (const branch of [test, then]) {
        params.push(ASTToSourceCode(branch));
    }

    return params;
}

function unexpandCond(ast: ASTSExprNode): string[] | false {
    // return new ASTSExprNode(
    //     ASTIdent("if"),
    //     test,
    //     value,
    //     rest.length > 0 ? new ASTSExprNode(
    //         TokenIdent("cond"),
    //         ...rest,
    //     ) : ASTVoid(),
    // )

    // TODO:

    return false;
}

export function ASTToSourceCode(ast: ASTNode | ASTProgram, ctx: RenderCtx = { indent: 0, indent_step: 2 }): string {
    const forms = ast instanceof ASTProgram ? ast.forms : [ast];

    return forms.map(form => {
        if (form instanceof ASTSExprNode)
            return ASTSExprNodeToSourceCode(form, ctx);
        if (form instanceof ASTLiteralNode)
            return ASTLiteralNodeToSourceCode(form, ctx);
        if (form instanceof ASTProcedureNode)
            return ASTProcedureNodeToSourceCode(form, ctx);
        return "";
    }).join("\n");

}

function symToName(sym: RuntimeSymbol) {
    return sym.interned ? sym.name : sym.name + sym.id;
}

export function ANFToString(node: ANF): string {
    if (node instanceof ANFLiteral) return node.value.literal;

    if (node instanceof ANFVar) return symToName(node.name);

    if (node instanceof ANFLambda) {
        const params = node.params.map(p => p.name).join(" ");
        const body_str = ANFToString(node.body);

        return `(λ (${params}) ${body_str})`;
    }

    if (node instanceof ANFApp) {
        const callee = ANFToString(node.callee);
        const args = node.args.map(a => ANFToString(a));

        return `(${callee} ${args.join(" ")})`;
    }

    if (node instanceof ANFLet) {
        const name_str = symToName(node.name);
        const value_str = ANFToString(node.value);
        const body_str = ANFToString(node.body);

        return `\n  (let (${name_str} ${value_str}) ${body_str})`;
    }

    if (node instanceof ANFIf) {
        const cond_str = ANFToString(node.cond);
        const then_str = ANFToString(node.then_branch);
        const else_str = ANFToString(node.else_branch);

        return `(if ${cond_str} ${then_str} ${else_str})`;
    }

    throw new Error("Unknown ANF node type.");
}

export function ANFProgramToString(program: ANFProgram) {
    return `(program ${program.name} ${ANFToString(program.body)})`;
}
