import { ASTLiteralNode, ASTProcedureNode } from "../../parser/ast.js";
import { Lexer } from "../../parser/lexer.js";
import { Token, TokenMetadataInjector, TokenType } from "../../parser/token.js";
import { BOOL_TRUE } from "../../shared/globals.js";
import { ASTProcedureNodeToSourceCode } from "./procedure.js";
import { RenderCtx } from "./render-context.js";

export function ASTLiteralNodeToSourceCode(ast: ASTLiteralNode, ctx: RenderCtx) {
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

