// Bracket Virtual Machine (BVM) binary files are of the following format:
//
//             File Header                   The file header identifies critical information
//  Magic Bytes (BRKT) ------- 4 bytes         about the file structure and build status including
//  Version ID --------------- 2 bytes         the word size (either 4 or 8 bytes), any flags
//  Word Size (4 or 8) ------- 1 byte          relating to the optimization level, debug mode, etc.
//  Flags -------------------- 1 byte          as well as magic bytes to correctly identify the file
//  Padding ------------------ 16 bytes        as being a proper Bracket binary file. This must be
//                                             placed directly at the start of the file.
//
//           Section Table                   The section table is used to position sections in the
//  Section Count ------------ 1 byte          file. These consist of a tag, the absolute file offset
//  Count Times:                               in bytes, and the size of the section. This must be
//   Section Tag ------------- 1 byte          placed immediately after the header.
//   Absolute Offset --------- 4 bytes
//   Size -------------------- 4 bytes
//
//            Symbol Table (0x01)            Defines a canonical mapping between numerical symbol
//  Symbol Count ------------- 4 bytes         identifiers and their textual names. Each symbol is
//  Symbol Count Times:                        uniquely defined by its symbol ID. Symbol names are
//   Symbol ID --------------- 4 bytes         length-prefixed and UTF-8 encoded. This section is 
//   Name Length ------------- 2 bytes         required.
//   Name (UTF8) ------------- Length bytes
//
//            Constant Pool (0x02)           The constant pool stores all literal values referenced
// Constant Count ------------ 4 bytes         by the bytecode. Constants are indexed implicitly
// Constant Count Times:                       by their position in the pool. Every constant entry
//  Constant Tag ------------- 1 byte          is self-describing through a 5-bit type tag and size.
//  Constant Size ------------ 2 bytes         This section is required.
//  Data --------------------- Size bytes
//
//           Procedure Table (0x03)          The procedure table defines all callable procedures in
// Procedure Count ----------- 4 bytes         the file and describes execution environments. Free   
// Procedure Count Times:                      variables are represented by symbol references for    
//  Entry PC ----------------- 4 bytes         closure construction and lexical scoping. This section
//  Arity -------------------- 2 bytes         is required.
//  Local Count -------------- 2 bytes
//  Free Variable Count ------ 2 bytes
//  Free Variables ----------- Free Var Count * 4 bytes
//
//             Bytecode (0x04)               The bytecode section contains the executable instruction
// Instruction Count Times:                    stream for the program. Control flow is expressed through
//  Opcode ------------------- 1 byte          relative jumps encoded as operands. THe instruction set
//  Operand ------------------ Varies          is defined externally according to the BVM specification.
//
//           Debug Info (0x10)               The debug info section contains auxiliary information
// Debug Subsection Count ---- 2 bytes         intended for diagnostics and tooling. This does not
// Count Times:                                affect program execution and is optional. This section
//  Subsection Tag ----------- 2 bytes         associates compiled procedures, variables, and symbols
//  Subsection Size ---------- 4 bytes         with human-readable metadata such as names, source
//  Subsection Data ---------- Size bytes      locations, and lexical scopes. This may be only
//                                             partially populated. Subsections are defined below.
//
//           Source Map (0x11)               The source map defines a mapping between regions of
// Mapping Count ------------- 4 bytes         bytecode and source files or source units. This
// Count Times:                                section is used to determine what source file produced
//  Start PC ----------------- 4 bytes         a given range of bytecode and which procedure or
//  End PC ------------------- 4 bytes         compilation unit a bytecode region originated from.
//  Source File ID ----------- 4 bytes         This section is optional.
//  Procedure Index ---------- 4 bytes
//  Flags -------------------- 1 byte          0: procedure body, 1: top-level or module initializer,
//                                             2: synthesized or compiler-generated, 3: inlined code
//
//           Line Info (0x12)                The line info section provides instruction-to-source line
// Line Program Count -------- 4 bytes         mappings for step-through debugging and runtime error
// Count Times:                                reporting. This establishes a relationship between
//  Start PC ----------------- 4 bytes         bytecode program counters and source line numbers.
//  End PC ------------------- 4 bytes         These are expected to be dense and sequential. This may
//  Initial File ID ---------- 4 bytes         depend on the source map or debug info for file
//  Initial Line ------------- 4 bytes         identification, but remains logically independent.
//  Instruction Count -------- 4 bytes
//  Line Program Data -------- varies
//
//           Type Info (0x13)
//          Not Yet Specified
//
//
//           Attributes (0x20)
//          Not Yet Specified
//
//         Custom/Vendor (0xFF)              The vendor section is reserved for experimental, third-party,
//                                             or domain-specific extensions. THis allows embedding
//                                             proprietary data without modifying the core format. The
//                                             runtime will skip this section unconditionally and execution
//                                             does not depend on it. Multiple custom/vendor sections may
//                                             exist, differentiated by internal tags or conventions within
//                                             the core vendor section.
//
// Debug Subsections:
//
//         Source File Table (0x01)          Defines the set of source files referenced by debug metadata.
// File Count ---------------- 4 bytes
// Count Times:
//  File ID ------------------ 4 bytes
//  Path Length -------------- 2 bytes
//  Path (UTF-8) ------------- Length bytes
//
//
//      Procedure Debug Records (0x02)       Associates procedures with human-readable names and source-level
// Record Count -------------- 4 bytes         location information.
// Count Times:
//  Procedure Index ---------- 4 bytes
//  Name Symbol ID ----------- 4 bytes
//  Source File ID ----------- 4 bytes
//  Start Line --------------- 4 bytes
//  End Line ----------------- 4 bytes
//
//      Variable Debug Records (0x03)        Provides source-level names and scope information for parameters,
// Record Count -------------- 4 bytes         locals, and free variables.
// Count Times:
//  Procedure Index ---------- 4 bytes
//  Variable Kind ------------ 1 byte         (0 = parameter, 1 = local, 2 = free)
//  Variable Index ----------- 2 bytes
//  Name Symbol ID ----------- 4 bytes
//  Scope Start PC ----------- 4 bytes
//  Scope End PC ------------- 4 bytes
//
//     Lexical Scope Records (0x04)          Encodes hierarchical lexical scope information for debuggers
// Scope Count --------------- 4 bytes         and static analysis tools.
// Count Times:
//  Procedure Index ---------- 4 bytes
//  Scope ID ----------------- 4 bytes
//  Parent Scope ID ---------- 4 bytes        (or 0xFFFFFFFF if none)
//  Start PC ----------------- 4 bytes
//  End PC ------------------- 4 bytes
//
//  Furthermore, BVM binaries are little endian and are byte-aligned.

import { ANFApp, ANFExpr, ANFIf, ANFLambda, ANFLet, ANFLiteral, ANFProgram, ANFVar } from "../anf.js";
import { BYTECODE_BUFFER_SIZE_FACTOR, BYTECODE_HEADER_SIZE, BYTECODE_PRIMITIVE_ENTRY, BYTECODE_PROGRAM_MAX_SIZE, BYTECODE_SECTION_TAG_BYTECODE, BYTECODE_SECTION_TAG_CONSTANT_POOL, BYTECODE_SECTION_TAG_PROCEDURE_TABLE, BYTECODE_SECTION_TAG_SYMBOL_TABLE } from "../../shared/globals.js";
import { BRACKET_PRIMITIVES, lookupPrimitive } from "../../runtime/primitives.js";
import { Token, TOKEN_PRINT_TYPE_MAP, TokenType } from "../../parser/token.js";
import { header } from "./sections/header.js";
import { symbolTable } from "./sections/symbol-table.js";
import { constantPool, ConstantTable } from "./sections/constant-pool.js";
import { procedureTable } from "./sections/procedure-table.js";
import { BCSection, sectionTable } from "./sections/section-table.js";
import { BCFloat, BCIdent, BCInteger, BCNil, BCString } from "./bytecode/data.js";
import { BCInternTable } from "./bytecode/intern-table.js";
import { BCInstr, BCInstrCode } from "./bytecode/opcodes.js";
import { createEmitter } from "./bytecode/emitter.js";
import { computeFreeVars } from "./analysis/free-vars.js";
import { Byte } from "../../shared/utils/binary/types.js";

export interface BCProcedure {
    entry: number;
    arity: number;
    locals: number;
    free_vars: number[];
}

function tokenToBCConstant(tok: Token) {
    switch (tok.type) {
        case TokenType.VOID: {
            return new BCNil();
        }

        case TokenType.NUM: {
            if (parseFloat(tok.literal) === parseInt(tok.literal))
                return new BCInteger(parseInt(tok.literal));

            if (!Number.isNaN(parseFloat(tok.literal)))
                return new BCFloat(parseFloat(tok.literal));

            throw new Error(`illegal ANF number literal`);
        }

        // TODO:
        case TokenType.SYM:
        case TokenType.BOOL:
        case TokenType.STR:
        case TokenType.IDENT:
        case TokenType.CHAR:
        case TokenType.PROCEDURE:
        case TokenType.LIST:

        case TokenType.QUOTE:
        case TokenType.FORM:
        case TokenType.LPAREN:
        case TokenType.RPAREN:
        case TokenType.META:
        case TokenType.MULTI:
        case TokenType.ANY:
        case TokenType.ERROR:
        case TokenType.EOF:
            throw new Error(`illegal ANF value of type ${TOKEN_PRINT_TYPE_MAP[tok.type]}`);
    }
}

export class BCCompiler {
    intern_table = new BCInternTable();
    private procedures: BCProcedure[] = [];
    private pending_procedures: {
        proc_index: number,
        lambda: ANFLambda,
    }[] = [];

    compileInstructions(anf: ANFProgram, consts: ConstantTable): BCInstr[] {
        const { emit, label, patch_labels, instructions } = createEmitter();

        let label_idx = 0;

        const compileANFExpr = (anf: ANFExpr) => {
            if (anf instanceof ANFLet) {
                compileANFExpr(anf.value);
                emit(
                    new BCInstr(
                        BCInstrCode.STORE_VAR,
                        new BCIdent(anf.sym, this.intern_table),
                    )
                );
                compileANFExpr(anf.body);
                return;

            } else if (anf instanceof ANFApp) {
                if (!(anf.callee instanceof ANFVar ||
                    anf.callee instanceof ANFLambda ||
                    anf.callee instanceof ANFLiteral)) {
                    throw new Error(`illegal ANF function application; expected an atom`);
                }

                if (anf.callee instanceof ANFVar) {
                    const prim = lookupPrimitive(anf.callee.sym);

                    if (prim) {
                        emit(
                            new BCInstr(
                                BCInstrCode.LOAD_VAR,
                                new BCIdent(anf.callee.sym, this.intern_table, true),
                            )
                        );

                        for (const arg of anf.args)
                            compileANFExpr(arg);

                        emit(new BCInstr(
                            BCInstrCode.CALL,
                            new BCInteger(anf.args.length)
                        ));

                        return;
                    }
                }

                compileANFExpr(anf.callee);
                for (const arg of anf.args)
                    compileANFExpr(arg);

                emit(
                    new BCInstr(
                        BCInstrCode.CALL,
                        new BCInteger(anf.args.length),
                    )
                );
                return;

            } else if (anf instanceof ANFLiteral) {
                const val = tokenToBCConstant(anf.value);
                const c = consts.intern(val);
                emit(
                    new BCInstr(
                        BCInstrCode.LOAD_CONST,
                        new BCInteger(c)
                    )
                );
                return;

            } else if (anf instanceof ANFVar) {
                const is_prim = lookupPrimitive(anf.sym) !== undefined;

                emit(
                    new BCInstr(
                        BCInstrCode.LOAD_VAR,
                        new BCIdent(anf.sym, this.intern_table, is_prim),
                    )
                );
                return;

            } else if (anf instanceof ANFIf) {
                const else_label = `else${label_idx++}`;
                const end_label = `end${label_idx++}`;

                compileANFExpr(anf.cond);
                emit(
                    new BCInstr(
                        BCInstrCode.JMP_FALSE,
                        new BCString(else_label),
                    )
                );

                compileANFExpr(anf.then_branch);
                emit(
                    new BCInstr(
                        BCInstrCode.JMP,
                        new BCString(end_label),
                    )
                );

                label(else_label);
                compileANFExpr(anf.else_branch);

                label(end_label);
                return;

            } else if (anf instanceof ANFLambda) {
                const free_vars = computeFreeVars(anf, this.intern_table);

                const proc_index = this.reserveProcedure(
                    anf.params.length,
                    0,
                    free_vars
                );

                emit(
                    new BCInstr(
                        BCInstrCode.MAKE_CLOSURE,
                        new BCInteger(proc_index),
                        new BCInteger(free_vars.length),
                    )
                );

                this.pending_procedures.push({
                    proc_index,
                    lambda: anf,
                });

                return;
            }

            throw new Error("unknown ANF node type");
        }

        compileANFExpr(anf.body);
        emit(new BCInstr(BCInstrCode.HALT));

        for (const proc of this.pending_procedures) {
            this.procedures[proc.proc_index].entry = instructions.length;
            compileANFExpr(proc.lambda.body);
            emit(new BCInstr(BCInstrCode.RETURN));
        }

        patch_labels();
        return instructions;
    }

    private reserveProcedure(arity: number, locals: number, free_vars: number[]) {
        const idx = this.procedures.length;
        this.procedures.push({ entry: -1, arity, locals, free_vars });
        return idx;
    }

    private reservePrimitiveProcedures() {
        for (const prim of BRACKET_PRIMITIVES) {
            this.intern_table.internBCSymbol(prim.proc_index, prim.name, true);
            this.procedures.push({
                entry: BYTECODE_PRIMITIVE_ENTRY,
                arity: prim.arity,
                locals: 0,
                free_vars: []
            });
        }
    }

    compile(anf: ANFProgram): Uint8Array {
        const consts = new ConstantTable();

        this.reservePrimitiveProcedures();

        const instructions = this.compileInstructions(anf, consts);

        let buf = new Uint8Array(1024);
        let pc = 0;

        const write = (...bytes: Byte[]) => {
            if (pc + bytes.length > buf.length) {
                const new_size = Math.floor(buf.length * BYTECODE_BUFFER_SIZE_FACTOR);

                if (new_size > BYTECODE_PROGRAM_MAX_SIZE)
                    throw new Error(`compiler out of memory; max: ${BYTECODE_PROGRAM_MAX_SIZE}`);

                const new_buf = new Uint8Array(new_size);
                new_buf.set(buf);
                buf = new_buf;
            }

            for (const b of bytes) buf[pc++] = b;
        }

        for (const instr of instructions) {
            write(instr.op);
            for (const arg of instr.args)
                write(...arg.raw());
        }


        const head = header();
        const symbols = symbolTable(this.intern_table);
        const constants = constantPool(consts);
        const procedures = procedureTable(this.procedures);
        const bytecode = buf.slice(0, pc);

        let section_offset = BYTECODE_HEADER_SIZE;
        const symbol_section: BCSection = { tag: BYTECODE_SECTION_TAG_SYMBOL_TABLE, size: symbols.length, offset: section_offset };
        section_offset += symbols.length;
        const constants_section: BCSection = { tag: BYTECODE_SECTION_TAG_CONSTANT_POOL, size: constants.length, offset: section_offset };
        section_offset += constants.length;
        const procedures_section: BCSection = { tag: BYTECODE_SECTION_TAG_PROCEDURE_TABLE, size: procedures.length, offset: section_offset };
        section_offset += procedures.length;
        const bytecode_section: BCSection = { tag: BYTECODE_SECTION_TAG_BYTECODE, size: bytecode.length, offset: section_offset };
        section_offset += bytecode.length;

        const section_table = sectionTable([
            symbol_section,
            constants_section,
            procedures_section,
            bytecode_section
        ]);

        const out = new Uint8Array(
            head.length +
            section_table.length +
            symbols.length +
            constants.length +
            procedures.length +
            bytecode.length
        );

        let offset = 0;
        for (const section of [head, section_table, symbols, constants, procedures, bytecode]) {
            out.set(section, offset);
            offset += section.length;
        }

        return out;
    }
}
