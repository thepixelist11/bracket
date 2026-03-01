import { ASTLiteralNode, ASTNode, ASTProcedureNode, ASTProgram, ASTSExprNode } from "../../parser/ast.js";
import { ASTLiteralNodeToSourceCode } from "./literal.js";
import { ASTProcedureNodeToSourceCode } from "./procedure.js";
import { RenderCtx } from "./render-context.js";
import { ASTSExprNodeToSourceCode } from "./sexpr.js";

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

