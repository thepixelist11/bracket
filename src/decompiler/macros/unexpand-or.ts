import { ASTLiteralNode, ASTSExprNode } from "../../parser/ast.js";
import { TokenType } from "../../parser/token.js";
import { BOOL_TRUE } from "../../shared/globals.js";
import { ASTLiteralNodeToSourceCode } from "../ast/literal.js";
import { RenderCtx } from "../ast/render-context.js";
import { ASTSExprNodeToSourceCode } from "../ast/sexpr.js";

export function unexpandOr(ast: ASTSExprNode, ctx: RenderCtx): string[] | false {
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

