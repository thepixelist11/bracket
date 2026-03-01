import { ASTLiteralNode, ASTSExprNode } from "../../parser/ast.js";
import { TokenType } from "../../parser/token.js";
import { BOOL_FALSE } from "../../shared/globals.js";
import { ASTLiteralNodeToSourceCode } from "../ast/literal.js";
import { RenderCtx } from "../ast/render-context.js";
import { ASTSExprNodeToSourceCode } from "../ast/sexpr.js";

export function unexpandAnd(ast: ASTSExprNode, ctx: RenderCtx): string[] | false {
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

