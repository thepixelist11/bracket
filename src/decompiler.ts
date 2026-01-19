import { ASTSExprNode, ASTProcedureNode, ASTLiteralNode, ASTProgram, ASTNode } from "./ast.js";
import { TokenType, BOOL_FALSE, BOOL_TRUE, TokenMetadataInjector, Token, RuntimeSymbol } from "./token.js";
import { Lexer } from "./lexer.js";
import { readFloat64, readInt32, readString, readUint16, readUint32, readUint8, toByteString } from "./utils.js";
import { BYTECODE_FLAG_ATTRIBUTE, BYTECODE_FLAG_DEBUG, BYTECODE_FLAG_LINE_INFO, BYTECODE_FLAG_OPTIMIZED, BYTECODE_FLAG_SOURCE_MAP, BYTECODE_FLAG_TYPE_INFO, BYTECODE_HEADER_SIZE, BYTECODE_MAGIC_BYTES, BYTECODE_SECTION_TAG_BYTECODE, BYTECODE_SECTION_TAG_CONSTANT_POOL, BYTECODE_SECTION_TAG_PROCEDURE_TABLE, BYTECODE_SECTION_TAG_SYMBOL_TABLE, DECOMPILER_CLOSING_ON_NEW_LINE, VERSION_ID, VERSION_ID_TO_NUMBER } from "./globals.js";
import { ANFApp, ANFIf, ANFLambda, ANFLet, ANFLiteral, ANFProgram, ANFVar, ANF } from "./anf.js";
import { BCBoolean, BCData, BCDataTag, BCFloat, BCIdent, BCInstrArityMap, BCInstrCode, BCInstrPrintMap, BCInteger, BCInternTable, BCNil, BCSection, BCString, BCSymbol, ConstantPool } from "./compiler.js";

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

function BCDataNumArrToString(data: number[]) {
    const [tag, ...raw] = data;

    switch (tag >> 3) {
        case BCDataTag.INT: {
            const buffer = new DataView(new Uint8Array(raw).buffer);
            return buffer.getInt32(0, true).toString();
        }

        case BCDataTag.FLOAT: {
            const buffer = new DataView(new Uint8Array(raw).buffer);
            return buffer.getFloat64(0, true).toString();
        }

        case BCDataTag.NIL:
            return "nil";

        case BCDataTag.IDENT:
        case BCDataTag.SYM: { // TODO: Intern table lookups
            const buffer = new DataView(new Uint8Array(raw).buffer);
            return buffer.getInt32(0, true).toString();
        }

        case BCDataTag.STR: {
            const length = raw[0];
            const encoded = new Uint8Array(raw.slice(1, 1 + length));
            return new TextDecoder().decode(encoded);
        }

        case BCDataTag.BOOL: {
            return (tag & 1) === 1 ? "#t" : "#f";
        }

        case BCDataTag.LIST:
        case BCDataTag.PAIR:
        case BCDataTag.PROC:
            throw new Error("not yet implemented");
    }

    return toByteString(data);
}

function BCDataToString(data: BCData, symbol_table: BCInternTable): string {
    switch (data.tag) {
        case BCDataTag.INT:
        case BCDataTag.FLOAT:
            return data.value.toString();

        case BCDataTag.IDENT:
        case BCDataTag.SYM:
            return symbol_table.get(data.value) ?? "undef";

        case BCDataTag.STR:
            return data.value;

        case BCDataTag.BOOL:
            return data.value ? "#t" : "#f";

        case BCDataTag.NIL:
            return "nil";
    }
}

export function BCToString(bytecode: Uint8Array, sym_table: BCInternTable, const_pool: ConstantPool) {
    let offset = 0;
    let out = "";

    const offset_print_len = bytecode.length.toString().length;

    const read = (bytes: number): number[] => {
        if (bytes + offset > bytecode.length)
            throw new Error(`attempted to read out of bytecode buffer bounds`);

        const arr = Array.from(bytecode.slice(offset, offset + bytes));
        offset += bytes;

        return arr;
    }

    const readDatum = (count: number): number[][] => {
        if (count === 0) return [];

        let results: number[][] = [];

        for (let i = 0; i < count; i++) {
            const tag = read(1)[0];

            results.push([tag]);

            switch (tag >> 3) {
                case BCDataTag.IDENT:
                case BCDataTag.SYM:
                case BCDataTag.INT:
                    results[results.length - 1].push(...read(4));
                    break;

                case BCDataTag.FLOAT:
                    results[results.length - 1].push(...read(8));
                    break;

                case BCDataTag.STR:
                    const len = read(1)[0];
                    results[results.length - 1].push(len, ...read(len));

                case BCDataTag.BOOL:
                case BCDataTag.NIL:
                    break;

                case BCDataTag.LIST:
                case BCDataTag.PAIR:
                case BCDataTag.PROC:
                    throw new Error("not yet implemented");
            }
        }

        return results;
    }

    while (offset < bytecode.length) {
        const instr_offset = offset;
        const op_code = read(1)[0];
        const op_name = BCInstrPrintMap.get(op_code);
        const arity = BCInstrArityMap.get(op_code);

        if (!op_name || arity === undefined)
            throw new Error(`undefined instruction: ${toByteString(op_code)} (${op_code}) at ${instr_offset}`);

        if (op_code === BCInstrCode.LABEL)
            throw new Error(`illegal LABEL instruction found in bytecode`);

        const args = readDatum(arity).map(BCDataNumArrToString);

        if (op_code === BCInstrCode.LOAD_CONST) {
            args[0] = `${args[0]} (${BCDataToString(const_pool[parseInt(args[0])], sym_table)})`;
        }

        if (
            op_code === BCInstrCode.JMP ||
            op_code === BCInstrCode.JMP_FALSE ||
            op_code === BCInstrCode.JMP_TRUE
        ) {
            const target_offset = parseInt(args[0]);
            const final_offset = instr_offset + target_offset;
            args[0] = `${args[0]} => ${final_offset}`;
        }

        if (
            op_code === BCInstrCode.LOAD_VAR ||
            op_code === BCInstrCode.STORE_VAR
        ) {
            args[0] = `${args[0]} (${sym_table.get(parseInt(args[0]))})`;
        }

        out += `${instr_offset.toString().padStart(offset_print_len)}`;
        out += ` ${op_name}`;
        out += ` ${args.join(" ")}`;
        out += "\n";
    }

    return out;
}

function readSymbolTable(buf: Uint8Array, offset: number) {
    const symbol_table = new Map<number, string>();
    const symbol_count = readUint32(buf, offset);
    offset += 4;

    for (let symbols_read = 0; symbols_read < symbol_count; symbols_read++) {
        const id = readUint32(buf, offset);
        offset += 4;

        const length = readUint16(buf, offset);
        offset += 2;

        const encoded = new Uint8Array(buf.slice(offset, offset + length));
        offset += length;

        const result = new TextDecoder().decode(encoded);
        symbol_table.set(id, result);
    }

    return new BCInternTable(symbol_table);
}

function readConstantPool(buf: Uint8Array, sym_table: BCInternTable, offset: number) {
    const constant_pool: { [key: number]: BCData } = {};
    const constant_count = readUint32(buf, offset);
    offset += 4;

    for (let constants_read = 0; constants_read < constant_count; constants_read++) {
        const tag_raw = buf[offset++];

        if (tag_raw >> 3 === BCDataTag.BOOL) {
            constant_pool[constants_read] = new BCBoolean((tag_raw & 1) === 1);
            offset += 2; // read 2 byte length;
            continue;
        }

        if (tag_raw >> 3 === BCDataTag.NIL) {
            constant_pool[constants_read] = new BCNil();
            offset += 2; // read 2 byte length;
            continue;
        }

        const length = readUint16(buf, offset);
        offset += 2;

        const data = new Uint8Array(length);
        for (let i = 0; i < length; i++)
            data[i] = buf[offset++];

        let bcdata: BCData = new BCNil();
        switch (tag_raw >> 3 as BCDataTag) {
            case BCDataTag.INT:
                bcdata = new BCInteger(readInt32(data));
                break;

            case BCDataTag.FLOAT:
                bcdata = new BCFloat(readFloat64(data));
                break;

            case BCDataTag.SYM: {
                const id = readInt32(data);
                const name = sym_table.get(id);
                if (!name)
                    throw new Error(`symbol ${id} missing in intern table`);
                bcdata = new BCSymbol(name, sym_table);
                break;
            }

            case BCDataTag.IDENT: {
                const sym = sym_table.get(readInt32(data));
                if (sym === undefined)
                    throw new Error(`symbol ${sym} is not defined in the symbol table`);
                bcdata = new BCIdent(sym, sym_table);
                break;
            }

            case BCDataTag.STR: {
                bcdata = new BCString(readString(data));
                break;
            }

            case BCDataTag.LIST:
            case BCDataTag.PAIR:
            case BCDataTag.PROC:
                throw new Error("not yet implemented");
        }

        constant_pool[constants_read] = bcdata;
    }

    return constant_pool;
}

function symbolTableToString(table: BCInternTable) {
    let out = "";
    let max_sym_length = 3;
    for (const sym of table.values())
        max_sym_length = Math.max(max_sym_length, sym.length);

    for (const [id, sym] of table) {
        out += `${id.toString().padEnd(max_sym_length - sym.length + 1)}${sym}\n`;
    }

    return out;
}

function constPoolToString(pool: ConstantPool, sym_table: BCInternTable) {
    let out = "";
    for (const idx in pool) {
        const datum = pool[idx];
        const datum_string = BCDataToString(datum, sym_table);
        out += `${idx.padEnd(6)}${datum_string}\n`;
    }
    return out;
}

export function binaryFileToString(buf: Uint8Array) {
    let out = "";

    const magic_bytes = [
        readUint8(buf, 0),
        readUint8(buf, 1),
        readUint8(buf, 2),
        readUint8(buf, 3),
    ].map(ch => String.fromCharCode(ch)).join("");

    const expected_magic_bytes =
        BYTECODE_MAGIC_BYTES.map(ch => String.fromCharCode(ch)).join("");

    if (magic_bytes !== expected_magic_bytes)
        throw new Error("invalid Bracket binary file");

    const version = readUint16(buf, 4);
    const word_size = readUint8(buf, 6);
    const flags = readUint8(buf, 7);

    let offset: number = BYTECODE_HEADER_SIZE;

    const section_table: { [key: number]: BCSection } = {};
    const section_count = readUint8(buf, offset++);
    for (let i = 0; i < section_count; i++) {
        const section_tag = readUint8(buf, offset++);
        const section_offset = readUint32(buf, offset);
        offset += 4;
        const section_size = readUint32(buf, offset);
        offset += 4;

        section_table[section_tag] = ({ tag: section_tag, offset: section_offset, size: section_size });
    }

    if (!section_table[BYTECODE_SECTION_TAG_SYMBOL_TABLE])
        throw new Error("malformed binary; symbol table section not found");
    if (!section_table[BYTECODE_SECTION_TAG_CONSTANT_POOL])
        throw new Error("malformed binary; constant pool section not found");
    if (!section_table[BYTECODE_SECTION_TAG_PROCEDURE_TABLE])
        throw new Error("malformed binary; procedure table section not found");
    if (!section_table[BYTECODE_SECTION_TAG_BYTECODE])
        throw new Error("malformed binary; bytecode section not found");

    const sym_table = readSymbolTable(buf, section_table[BYTECODE_SECTION_TAG_SYMBOL_TABLE].offset);
    const const_pool = readConstantPool(buf, sym_table, section_table[BYTECODE_SECTION_TAG_CONSTANT_POOL].offset);
    const bytecode_section = section_table[BYTECODE_SECTION_TAG_BYTECODE];
    const bytecode = buf.slice(bytecode_section.offset, bytecode_section.offset + bytecode_section.size);

    out += "==== INFORMATION ==== \n";
    out += `Bracket version  : ${VERSION_ID_TO_NUMBER(version)}\n`;
    out += `Word size        : ${word_size}\n`;
    out += `Debug            : ${flags & BYTECODE_FLAG_DEBUG}\n`;
    out += `Optimized        : ${flags & BYTECODE_FLAG_OPTIMIZED}\n`;
    out += `Source Map       : ${flags & BYTECODE_FLAG_SOURCE_MAP}\n`;
    out += `Attribute        : ${flags & BYTECODE_FLAG_ATTRIBUTE}\n`;
    out += `Line Info        : ${flags & BYTECODE_FLAG_LINE_INFO}\n`;
    out += `Type Info        : ${flags & BYTECODE_FLAG_TYPE_INFO}\n\n`;
    out += "==== INTERN TABLE ====\n";
    out += symbolTableToString(sym_table) + "\n";
    out += "===== CONST POOL =====\n";
    out += constPoolToString(const_pool, sym_table) + "\n";
    out += "====== BYTECODE ======\n";
    out += BCToString(bytecode, sym_table, const_pool);

    return out;
}
