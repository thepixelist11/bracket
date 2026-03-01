import { BYTECODE_FLAG_ATTRIBUTE, BYTECODE_FLAG_DEBUG, BYTECODE_FLAG_LINE_INFO, BYTECODE_FLAG_OPTIMIZED, BYTECODE_FLAG_SOURCE_MAP, BYTECODE_FLAG_TYPE_INFO, BYTECODE_HEADER_SIZE, BYTECODE_MAGIC_BYTES, BYTECODE_SECTION_TAG_BYTECODE, BYTECODE_SECTION_TAG_CONSTANT_POOL, BYTECODE_SECTION_TAG_PROCEDURE_TABLE, BYTECODE_SECTION_TAG_SYMBOL_TABLE, DECOMPILER_CLOSING_ON_NEW_LINE, VERSION_ID, VERSION_ID_TO_NUMBER } from "../../shared/globals.js";
import { readSymbolTable } from "./section-readers/symbol-table.js";
import { readConstantPool } from "./section-readers/constant-pool.js";
import { readProcedureTable } from "./section-readers/procedure-table.js";
import { symbolTableToString } from "./tables-to-string/symbol-table.js";
import { constPoolToString } from "./tables-to-string/constant-pool.js";
import { procedureTableToString } from "./tables-to-string/procedure-table.js";
import { BCToString } from "./bytecode-to-string.js";
import { BCSection } from "../../ir/compiler/sections/section-table.js";
import { readUint16, readUint32, readUint8 } from "../../shared/utils/binary/reader.js";

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
    const procedure_table = readProcedureTable(buf, section_table[BYTECODE_SECTION_TAG_PROCEDURE_TABLE].offset);
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
    out += "==== PROCEDURE TABLE ====\n";
    out += procedureTableToString(procedure_table) + "\n";
    out += "====== BYTECODE ======\n";
    out += BCToString(bytecode, sym_table, const_pool);

    return out;
}
