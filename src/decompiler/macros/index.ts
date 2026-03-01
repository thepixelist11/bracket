import { unexpandAnd } from "./unexpand-and.js";
import { unexpandOr } from "./unexpand-or.js";
import { unexpandCond } from "./unexpand-cond.js";
import { unexpandVoid } from "./unexpand-void.js";
import { unexpandWhen } from "./unexpand-when.js";
import { ASTSExprNode } from "../../parser/ast.js";
import { RenderCtx, renderList } from "../ast/render-context.js";

export function tryUnexpand(ast: ASTSExprNode, ctx: RenderCtx): string | null {
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

    return null;
}
