#include "vm.h"
#include "array.h"
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

char* read_file(const char* path, size_t* out_size) {
    FILE* file = fopen(path, "rb");
    if (file == NULL) {
        fprintf(stderr, "could not open file \"%s\"", path);
        exit(EXIT_FILE_READ);
    }

    fseek(file, 0L, SEEK_END);
    size_t file_size = ftell(file);
    rewind(file);

    char* buffer = (char*)malloc(file_size + 1);
    if (buffer == NULL) {
        fprintf(stderr, "not enough memory to read \"%s\"", path);
        exit(EXIT_FILE_READ);
    }

    size_t bytes_read = fread(buffer, sizeof(char), file_size, file);
    if (bytes_read < file_size) {
        fprintf(stderr, "could not read file \"%s\"", path);
        exit(EXIT_FILE_READ);
    }

    buffer[bytes_read] = '\0';
    fclose(file);

    *out_size = (size_t)file_size;
    return buffer;
}

static uint8_t read_uint8(Reader* r) {
    if (r->cur + 1 > r->end) {
        fprintf(stderr, "attempted to read out of bounds\n");
        exit(EXIT_READ_OUT_OF_BOUNDS);
    }

    const uint8_t* p = r->cur;
    r->cur += 1;

    return p[0];
}

static uint16_t read_uint16(Reader* r) {
    if (r->cur + 2 > r->end) {
        fprintf(stderr, "attempted to read out of bounds\n");
        exit(EXIT_READ_OUT_OF_BOUNDS);
    }

    const uint8_t* p = r->cur;
    r->cur += 2;

    return ((uint16_t)p[0]) | ((uint16_t)p[1] << 8);
}

static uint32_t read_uint32(Reader* r) {
    if (r->cur + 4 > r->end) {
        fprintf(stderr, "attempted to read out of bounds\n");
        exit(EXIT_READ_OUT_OF_BOUNDS);
    }

    const uint8_t* p = r->cur;
    r->cur += 4;

    return ((uint32_t)p[0]) | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) |
           ((uint32_t)p[3] << 24);
}

static uint8_t* read_bytes(Reader* r, size_t bytes) {
    if (r->cur + bytes > r->end) {
        fprintf(stderr, "attempted to read out of bounds\n");
        exit(EXIT_READ_OUT_OF_BOUNDS);
    }

    uint8_t* b = (uint8_t*)malloc(bytes);
    if (b == NULL) {
        fprintf(stderr, "failed to create read byte buffer\n");
        exit(EXIT_FAILURE);
    }

    memcpy(b, r->cur, bytes);
    r->cur += bytes;
    return b;
}

static void skip_bytes(Reader* r, size_t bytes) {
    r->cur += bytes;
}

static BVMConstant read_datum(Reader* r) {
    uint8_t tag = read_uint8(r);

    switch (tag >> 3) {
        case TAG_BOOL:
        case TAG_NIL: {
            return (BVMConstant){ .tag = tag, .size = 0, .data = NULL };
        }

        case TAG_IDENT:
        case TAG_SYM:
        case TAG_INT: {
            uint8_t* result = (uint8_t*)malloc(4);
            uint8_t* read   = read_bytes(r, 4);
            memcpy(result, read, 4);
            free(read);
            return (BVMConstant){ .tag = tag, .size = 4, .data = result };
        }

        case TAG_FLOAT: {
            uint8_t* result = (uint8_t*)malloc(8);
            uint8_t* read   = read_bytes(r, 8);
            memcpy(result, read, 8);
            free(read);
            return (BVMConstant){ .tag = tag, .size = 8, .data = result };
        }

        case TAG_STR: {
            uint16_t length    = read_uint16(r);
            uint8_t* result    = (uint8_t*)malloc(length + sizeof(uint16_t));
            uint8_t* read      = read_bytes(r, length);
            *(uint16_t*)result = length;
            memcpy(result + sizeof(uint16_t), read, length);
            free(read);
            return (BVMConstant){ .tag  = tag,
                                  .size = length + sizeof(uint16_t),
                                  .data = result };
        }
    }

    fprintf(stderr, "failed to read datum; invalid tag: %u", tag);
    exit(EXIT_FAILURE);
}

static array_const read_datums(Reader* r, size_t count) {
    array_const result;
    result.length   = 0;
    result.capacity = count;
    result.data     = malloc(count * sizeof(BVMConstant));

    for (size_t i = 0; i < count; i++) {
        result.data[i] = read_datum(r);
        result.length++;
    }

    return result;
}

static BVMPrimitiveKind primitive_of_proc(uint32_t proc_idx) {
    switch (proc_idx) {
        case 0: return PRIM_ADD;
        case 1: return PRIM_SUB;
        case 2: return PRIM_MUL;
        case 3: return PRIM_DIV;
        case 4: return PRIM_CMP_EQ;
        case 5: return PRIM_CMP_LT;
        case 6: return PRIM_CMP_GT;
        case 7: return PRIM_NOT;
        default:
            fprintf(stderr, "unknown primitive procedure index\n");
            exit(EXIT_FAILURE);
    }
}

static BVMValue execute_primitive(BVMPrimitiveKind prim, BVMValue* args) {
    switch (prim) {
        case PRIM_ADD:
            return (BVMValue){ .tag = TAG_INT, .as.i = args[0].as.i + args[1].as.i };

        case PRIM_SUB:
            return (BVMValue){ .tag = TAG_INT, .as.i = args[0].as.i - args[1].as.i };

        case PRIM_MUL:
            return (BVMValue){ .tag = TAG_INT, .as.i = args[0].as.i * args[1].as.i };

        case PRIM_DIV:
            return (BVMValue){ .tag = TAG_INT, .as.i = args[0].as.i / args[1].as.i };

        case PRIM_CMP_EQ:
            return (BVMValue){ .tag = TAG_BOOL, .as.i = args[0].as.i == args[1].as.i };

        case PRIM_CMP_LT:
            return (BVMValue){ .tag = TAG_BOOL, .as.i = args[0].as.i < args[1].as.i };

        case PRIM_CMP_GT:
            return (BVMValue){ .tag = TAG_BOOL, .as.i = args[0].as.i > args[1].as.i };

        case PRIM_NOT: return (BVMValue){ .tag = TAG_BOOL, .as.i = !args[0].as.i };
    }

    fprintf(stderr, "unhandled primitive\n");
    exit(EXIT_FAILURE);
}

static uint8_t op_arity(BVMInstrCode code) {
    switch (code) {
        case OP_RETURN: return 0;
        case OP_POP: return 0;
        case OP_HALT: return 0;

        case OP_LOAD_CONST: return 1;
        case OP_LOAD_VAR: return 1;
        case OP_STORE_VAR: return 1;
        case OP_JMP: return 1;
        case OP_JMP_TRUE: return 1;
        case OP_JMP_FALSE: return 1;
        case OP_LABEL: return 1;
        case OP_CALL: return 1;
        case OP_TAILCALL: return 1;
        case OP_LOAD_CLOSURE: return 1;
        case OP_STORE_CLOSURE: return 1;

        case OP_MAKE_CLOSURE: return 2;
    }

    return 0;
}

static uint32_t alloc_env(BVM* bvm, uint32_t parent, uint16_t size) {
    if (bvm->env_count >= bvm->env_capacity) {
        bvm->env_capacity *= ARRAY_GROW_FACTOR;
        bvm->envs = realloc(bvm->envs, bvm->env_capacity * sizeof(BVMEnv));
        if (!bvm->envs) {
            fprintf(stderr, "failed to grow environment store\n");
            exit(EXIT_FAILURE);
        }
    }

    uint32_t idx          = bvm->env_count++;
    bvm->envs[idx].parent = parent;
    bvm->envs[idx].size   = size;
    bvm->envs[idx].slots  = calloc(size, sizeof(BVMValue));

    if (!bvm->envs[idx].slots) {
        fprintf(stderr, "failed to allocate environment slots\n");
        exit(EXIT_FAILURE);
    }

    return idx;
}

// TODO: constant time lookups
static int symbol_id_of(BVMProgram* program, const char* name) {
    for (uint32_t i = 0; i < program->symbol_count; i++) {
        if (strncmp(program->symbols[i].name, name, program->symbols[i].name_len) == 0) {
            return program->symbols[i].id;
        }
    }

    return -1;
}

void init_bvm_program(const void* bin, size_t bin_size, BVMProgram* bvm) {
    Reader reader = {
        .start = (const uint8_t*)bin,
        .cur   = (const uint8_t*)bin,
        .end   = (const uint8_t*)bin + bin_size,
    };

    uint32_t magic = read_uint32(&reader);

    if (magic != BVM_MAGIC) {
        fprintf(stderr, "malformed BVM binary; incorrect magic bytes\n");
        exit(EXIT_INVALID_MAGIC);
    }

    /* ======================= Header ========================= */

    uint16_t version   = read_uint16(&reader);
    uint8_t  word_size = read_uint8(&reader);
    uint8_t  flags     = read_uint8(&reader);
    skip_bytes(&reader, 16);

    bvm->header = (BVMHeader){ .magic     = magic,
                               .version   = version,
                               .word_size = word_size,
                               .flags     = flags };

    bool flag_optimized  = flags & 0b00000001;
    bool flag_debug      = flags & 0b00000010;
    bool flag_source_map = flags & 0b00000100;
    bool flag_attribute  = flags & 0b00001000;
    bool flag_line_info  = flags & 0b00010000;
    bool flag_type_info  = flags & 0b00100000;

    /* ================== Section Table ======================= */

    uint8_t section_count = read_uint8(&reader);
    bvm->section_count    = section_count;
    bvm->sections         = (BVMSection*)malloc(section_count * sizeof(BVMSection));
    if (bvm->sections == NULL) {
        fprintf(stderr, "failed to create BVM section table\n");
        exit(EXIT_FAILURE);
    }

    for (size_t i = 0; i < section_count; i++) {
        uint8_t  section_tag    = read_uint8(&reader);
        uint32_t section_offset = read_uint32(&reader);
        uint32_t section_size   = read_uint32(&reader);
        bvm->sections[i]        = (BVMSection){ .tag    = section_tag,
                                                .offset = section_offset,
                                                .size   = section_size };
    }

    /* ================== Section Reading ===================== */

    for (size_t i = 0; i < section_count; i++) {
        BVMSection section = bvm->sections[i];
        reader.cur         = reader.start + section.offset;

        switch (section.tag) {
            case S_TAG_SYMBOL_TABLE: {
                uint32_t        symbol_count = read_uint32(&reader);
                BVMSymbolEntry* symbols =
                  (BVMSymbolEntry*)malloc(symbol_count * sizeof(BVMSymbolEntry));

                for (size_t symbols_idx = 0; symbols_idx < symbol_count; symbols_idx++) {
                    uint32_t id     = read_uint32(&reader);
                    uint16_t length = read_uint16(&reader);
                    char*    data   = (char*)read_bytes(&reader, length);

                    symbols[symbols_idx] = (BVMSymbolEntry){
                        .id       = id,
                        .name_len = length,
                        .name     = data,
                    };
                }

                bvm->symbol_count = symbol_count;
                bvm->symbols      = symbols;
                break;
            }

            case S_TAG_CONSTANT_POOL: {
                uint32_t     constant_count = read_uint32(&reader);
                BVMConstant* constant_pool =
                  (BVMConstant*)malloc(constant_count * sizeof(BVMConstant));

                for (size_t constant_idx = 0; constant_idx < constant_count;
                     constant_idx++) {
                    uint8_t tag = read_uint8(&reader);

                    if ((tag >> 3) == TAG_BOOL) {
                        uint8_t* data = (uint8_t*)malloc(1);
                        data[0]       = tag & 1;
                        constant_pool[constant_idx] =
                          (BVMConstant){ .tag = tag, .size = 1, .data = data };
                    } else if ((tag >> 3) == TAG_NIL) {
                        constant_pool[constant_idx] =
                          (BVMConstant){ .tag = tag, .size = 0, .data = NULL };
                    } else {
                        uint16_t size = read_uint16(&reader);
                        uint8_t* data = read_bytes(&reader, size);

                        constant_pool[constant_idx] =
                          (BVMConstant){ .tag = tag, .size = size, .data = data };
                    }
                }

                bvm->constant_count = constant_count;
                bvm->constants      = constant_pool;
                break;
            }

            case S_TAG_PROCEDURE_TABLE: {
                uint32_t      procedure_count = read_uint32(&reader);
                BVMProcedure* procedures =
                  (BVMProcedure*)malloc(procedure_count * sizeof(BVMProcedure));

                for (size_t proc_idx = 0; proc_idx < procedure_count; proc_idx++) {
                    uint32_t entry  = read_uint32(&reader);
                    uint32_t arity  = read_uint16(&reader);
                    uint32_t locals = read_uint16(&reader);

                    uint32_t  free_var_count = read_uint16(&reader);
                    uint32_t* free_vars =
                      (uint32_t*)malloc(free_var_count * sizeof(uint32_t));
                    for (size_t i = 0; i < free_var_count; i++) {
                        free_vars[i] = read_uint32(&reader);
                    }

                    procedures[proc_idx] = (BVMProcedure){ .arity       = arity,
                                                           .free_vars   = free_vars,
                                                           .free_count  = free_var_count,
                                                           .local_count = locals,
                                                           .entry_pc    = entry };
                }

                bvm->procedure_count = procedure_count;
                bvm->procedures      = procedures;
                break;
            };

            case S_TAG_BYTECODE: {
                uint8_t* bytecode = read_bytes(&reader, section.size);

                Reader count_r = { .start = bytecode,
                                   .cur   = bytecode,
                                   .end   = bytecode + section.size };

                size_t instruction_count = 0;
                while (count_r.cur < count_r.end) {
                    BVMInstrCode opcode = read_uint8(&count_r);
                    uint8_t      arity  = op_arity(opcode);

                    for (uint8_t i = 0; i < arity; i++) {
                        (void)read_datum(&count_r);
                    }

                    instruction_count++;
                }

                BVMInstruction* instructions =
                  (BVMInstruction*)malloc(instruction_count * sizeof(BVMInstruction));
                if (!instructions) {
                    fprintf(stderr, "failed to allocate instruction array\n");
                    exit(EXIT_FAILURE);
                }

                Reader bcr = (Reader){ .start = bytecode,
                                       .cur   = bytecode,
                                       .end   = bytecode + section.size };

                for (size_t i = 0; i < instruction_count; i++) {
                    BVMInstrCode opcode = read_uint8(&bcr);
                    uint8_t      arity  = op_arity(opcode);

                    array_const args = read_datums(&bcr, arity);
                    instructions[i] =
                      (BVMInstruction){ .opcode = opcode, .operand = args.data };
                }

                bvm->instruction_count = instruction_count;
                bvm->bytecode          = instructions;

                free(bytecode);
                break;
            }

            case S_TAG_SOURCE_MAP: break;
            case S_TAG_LINE_INFO: break;
            case S_TAG_TYPE_INFO: break;
            case S_TAG_ATTRIBUTES: break;
            case S_TAG_VENDOR: break;

            default: break;
        }
    }
}

void free_bvm_program(const BVMProgram* bvm) {}

void init_bvm(BVM* bvm, const BVMProgram* program) {
    if (bvm == NULL || program == NULL) {
        fprintf(stderr, "initBVMExec: invalid arguments\n");
        exit(EXIT_FAILURE);
    }

    memset(bvm, 0, sizeof(BVM));

    bvm->program = program;

    /* ================== Instruction State ===================== */

    bvm->halted = 0;
    bvm->error  = 0;

    /* ======================== Stack =========================== */

    bvm->stack.capacity = 256;
    bvm->stack.top      = 0;
    bvm->stack.data     = (BVMValue*)malloc(bvm->stack.capacity * sizeof(BVMValue));

    if (bvm->stack.data == NULL) {
        fprintf(stderr, "failed to allocate VM stack\n");
        exit(EXIT_FAILURE);
    }

    /* ===================== Environment ======================== */

    bvm->env_capacity = 64;
    bvm->env_count    = 1;

    bvm->envs = (BVMEnv*)malloc(bvm->env_capacity * sizeof(BVMEnv));

    if (bvm->envs == NULL) {
        fprintf(stderr, "failed to allocate environment store\n");
        exit(EXIT_FAILURE);
    }

    /* ======================= Global =========================== */

    bvm->envs[0].parent = UINT32_MAX;
    bvm->envs[0].size   = (uint16_t)program->symbol_count;
    bvm->envs[0].slots  = (BVMValue*)calloc(program->symbol_count, sizeof(BVMValue));

    if (bvm->envs[0].slots == NULL) {
        fprintf(stderr, "failed to allocate global environment\n");
        exit(EXIT_FAILURE);
    }

    bvm->global_env  = 0;
    bvm->current_env = 0;

    /* ==================== Entry Frame ========================= */

    bvm->frame_capacity = 64;
    bvm->frame_count    = 1;
    bvm->frames         = malloc(bvm->frame_capacity * sizeof(BVMFrame));
    bvm->frames[0]      = (BVMFrame){
             .return_pc  = UINT32_MAX,
             .env_idx    = bvm->global_env,
             .stack_base = 0,
    };

    /* ==================== Primitives ========================== */

    for (uint32_t i = 0; i < bvm->program->procedure_count; i++) {
        BVMProcedure* proc = &bvm->program->procedures[i];

        if (proc->entry_pc != BVM_PRIMITIVE_ENTRY) continue;

        const char* prim_name = NULL;

        switch (primitive_of_proc(i)) {
            case PRIM_ADD: prim_name = "+"; break;
            case PRIM_SUB: prim_name = "-"; break;
            case PRIM_MUL: prim_name = "*"; break;
            case PRIM_DIV: prim_name = "/"; break;
            case PRIM_CMP_EQ: prim_name = "="; break;
            case PRIM_CMP_LT: prim_name = "<"; break;
            case PRIM_CMP_GT: prim_name = ">"; break;
            case PRIM_NOT: prim_name = "not"; break;
        }

        int sym_id = symbol_id_of((BVMProgram*)bvm->program, prim_name);
        if (sym_id < 0) {
            fprintf(stderr, "primitive symbol not found: %s\n", prim_name);
            exit(EXIT_FAILURE);
        }

        bvm->envs[bvm->global_env].slots[sym_id] = (BVMValue){
            .tag        = TAG_PROC,
            .as.closure = { .proc_idx = i, .env_idx = UINT32_MAX }
        };
    }
}

void free_bvm(BVM* bvm) {
    if (bvm == NULL) return;

    free(bvm->stack.data);
    free(bvm->frames);

    for (uint32_t i = 0; i < bvm->env_count; i++) {
        free(bvm->envs[i].slots);
    }

    free(bvm->envs);
    free_bvm_program(bvm->program);
}

static BVMValue make_value_from_constant(BVMConstant* c) {
    switch (c->tag >> 3) {
        case TAG_INT: return (BVMValue){ .tag = TAG_INT, .as.i = *(int32_t*)c->data };

        case TAG_FLOAT: return (BVMValue){ .tag = TAG_FLOAT, .as.f = *(double*)c->data };

        case TAG_SYM:
            return (BVMValue){ .tag = TAG_SYM, .as.sym.sym_id = *(uint32_t*)c->data };

        case TAG_IDENT:
            return (BVMValue){ .tag = TAG_IDENT, .as.sym.sym_id = *(uint32_t*)c->data };

        case TAG_BOOL: return (BVMValue){ .tag = TAG_BOOL, .as.b = c->tag & 1 };

        case TAG_NIL: return (BVMValue){ .tag = TAG_NIL };

        case TAG_STR: {
            uint16_t len  = *(uint16_t*)c->data;
            char*    data = (char*)malloc(len);
            if (data == NULL) {
                fprintf(stderr, "out of memory creating string constant\n");
                exit(EXIT_FAILURE);
            }

            memcpy(data, (uint8_t*)c->data + sizeof(uint16_t), len);

            return (BVMValue){ .tag = TAG_STR, .as.str.len = len, .as.str.data = data };
        }
    }

    fprintf(stderr, "invalid constant tag: %u\n", c->tag >> 3);
    exit(EXIT_FAILURE);
};

static BVMValue pop_stack(BVMStack* stack) {
    if (stack->top == 0) {
        fprintf(stderr, "stack underflow\n");
        exit(EXIT_FAILURE);
    }

    return stack->data[--stack->top];
}

static void push_stack(BVMStack* stack, BVMValue val) {
    if (stack->top >= stack->capacity) {
        fprintf(stderr, "stack overflow\n");
        exit(EXIT_FAILURE);
    }
    stack->data[stack->top++] = val;
}

static inline BVMConstant* operand_at(BVMInstruction* instr, uint8_t index) {
    if (!instr->operand) {
        fprintf(stderr, "instruction has no operands\n");
        exit(EXIT_FAILURE);
    }

    return &instr->operand[index];
}

void execute_bvm(BVM* bvm) {
    BVMInstruction* code_start = bvm->program->bytecode;
    BVMInstruction* pc         = code_start;
    BVMInstruction* code_end   = code_start + bvm->program->instruction_count;

    while (!bvm->error && !bvm->halted) {
        if (pc < code_start || pc >= code_end) {
            fprintf(stderr, "program counter out of bounds\n");
            bvm->error = 1;
            break;
        }

        switch (pc->opcode) {
            case OP_HALT: {
                bvm->halted = 1;
                break;
            }

            case OP_POP: {
                pop_stack(&bvm->stack);
                pc++;
                break;
            }

            case OP_LOAD_CONST: {
                BVMConstant* op = operand_at(pc, 0);

                if (op->size < sizeof(uint32_t)) {
                    fprintf(stderr, "invalid operand size for LOAD_CONST\n");
                    exit(EXIT_FAILURE);
                }

                uint32_t idx = *(uint32_t*)op->data;

                BVMConstant* c = &bvm->program->constants[idx];
                BVMValue     v = make_value_from_constant(c);
                push_stack(&bvm->stack, v);
                pc++;
                break;
            }

            case OP_LOAD_VAR: {
                BVMConstant* op     = operand_at(pc, 0);
                uint32_t     sym_id = *(uint32_t*)op->data;

                BVMEnv* env = &bvm->envs[bvm->current_env];

                if (sym_id >= env->size) {
                    fprintf(stderr, "symbol id out of range in LOAD_VAR\n");
                    exit(EXIT_FAILURE);
                }

                push_stack(&bvm->stack, env->slots[sym_id]);
                pc++;
                break;
            }

            case OP_STORE_VAR: {
                BVMConstant* op = operand_at(pc, 0);

                if (op->size < sizeof(uint32_t)) {
                    fprintf(stderr, "invalid operand size for STORE_VAR\n");
                    exit(EXIT_FAILURE);
                }

                uint32_t sym_id = *(uint32_t*)op->data;

                BVMEnv* env = &bvm->envs[bvm->current_env];

                if (sym_id >= env->size) {
                    fprintf(stderr, "symbol id is out of range in STORE_VAR\n");
                    exit(EXIT_FAILURE);
                }

                BVMValue value     = pop_stack(&bvm->stack);
                env->slots[sym_id] = value;

                pc++;
                break;
            }

            case OP_JMP: {
                BVMConstant* op     = operand_at(pc, 0);
                int32_t      offset = *(int32_t*)op->data;
                pc += offset;
                break;
            }

            case OP_JMP_TRUE: {
                BVMConstant* op     = operand_at(pc, 0);
                int32_t      offset = *(int32_t*)op->data;
                BVMValue     cond   = pop_stack(&bvm->stack);
                if (cond.as.b) {
                    pc += offset;
                } else {
                    pc++;
                }
                break;
            }

            case OP_JMP_FALSE: {
                BVMConstant* op     = operand_at(pc, 0);
                int32_t      offset = *(int32_t*)op->data;
                BVMValue     cond   = pop_stack(&bvm->stack);
                if (cond.as.b) {
                    pc++;
                } else {
                    pc += offset;
                }
                break;
            }

            case OP_RETURN: {
                BVMValue ret   = pop_stack(&bvm->stack);
                BVMFrame frame = bvm->frames[--bvm->frame_count];

                if (frame.return_pc == UINT32_MAX) {
                    bvm->halted = 1;
                    break;
                }

                bvm->current_env = frame.env_idx;
                bvm->stack.top   = frame.stack_base;

                printf("tag: %b, value: %li\n", ret.tag, ret.as.i);

                push_stack(&bvm->stack, ret);
                pc = code_start + frame.return_pc;
                break;
            }

            case OP_LABEL: {
                fprintf(stderr, "unexpected LABEL operator in bytecode\n");
                bvm->error = 1;
                break;
            }

            case OP_MAKE_CLOSURE: {
                uint32_t      proc_idx = *(uint32_t*)operand_at(pc, 0)->data;
                BVMProcedure* proc     = &bvm->program->procedures[proc_idx];

                uint32_t env_idx = alloc_env(bvm, bvm->current_env, proc->free_count);
                BVMEnv*  env     = &bvm->envs[env_idx];

                for (uint16_t i = 0; i < proc->free_count; i++) {
                    uint32_t sym_id = proc->free_vars[i];
                    env->slots[i]   = bvm->envs[bvm->current_env].slots[sym_id];
                }

                push_stack(&bvm->stack, (BVMValue){
                                          .tag        = TAG_PROC,
                                          .as.closure = { .proc_idx = proc_idx,
                                                         .env_idx  = env_idx }
                });

                pc++;
                break;
            }

            case OP_LOAD_CLOSURE: {
                uint32_t idx         = *(uint32_t*)operand_at(pc, 0)->data;
                uint32_t closure_env = bvm->envs[bvm->current_env].parent;

                if (closure_env == UINT32_MAX) {
                    fprintf(stderr, "LOAD_CLOSURE outside closure\n");
                    bvm->error = 1;
                    break;
                }

                push_stack(&bvm->stack, bvm->envs[closure_env].slots[idx]);
                pc++;
                break;
            }

            case OP_STORE_CLOSURE: {
                uint32_t idx                      = *(uint32_t*)operand_at(pc, 0)->data;
                uint32_t closure_env              = bvm->envs[bvm->current_env].parent;
                bvm->envs[closure_env].slots[idx] = pop_stack(&bvm->stack);
                pc++;
                break;
            }

            case OP_CALL: {
                uint32_t argc = *(uint32_t*)operand_at(pc, 0)->data;

                BVMValue args[argc];
                for (int i = argc - 1; i >= 0; i--) {
                    args[i] = pop_stack(&bvm->stack);
                }

                BVMValue callee = pop_stack(&bvm->stack);
                if (callee.tag != TAG_PROC) {
                    fprintf(stderr, "attempted to call non-procedure\n");
                    bvm->error = 1;
                    break;
                }

                BVMProcedure* proc =
                  &bvm->program->procedures[callee.as.closure.proc_idx];

                if (proc->entry_pc == BVM_PRIMITIVE_ENTRY) {
                    BVMPrimitiveKind prim = primitive_of_proc(callee.as.closure.proc_idx);
                    BVMValue         result = execute_primitive(prim, args);

                    push_stack(&bvm->stack, result);
                    pc++;
                    break;
                }

                if (argc != proc->arity) {
                    fprintf(stderr, "arity mismatch: expected %d arguments, got %d",
                            proc->arity, argc);
                    bvm->error = 1;
                    break;
                }

                uint32_t env_idx = alloc_env(bvm, callee.as.closure.env_idx,
                                             proc->arity + proc->local_count);

                BVMEnv* env = &bvm->envs[env_idx];

                for (uint16_t i = 0; i < proc->arity; i++) {
                    env->slots[i] = args[i];
                }

                if (bvm->frame_count >= bvm->frame_capacity) {
                    bvm->frame_capacity *= ARRAY_GROW_FACTOR;
                    bvm->frames =
                      realloc(bvm->frames, bvm->frame_capacity * sizeof(BVMFrame));

                    if (!bvm->frames) {
                        fprintf(stderr, "failed to grow frame stack\n");
                        bvm->error = 1;
                        break;
                    }
                }

                bvm->frames[bvm->frame_count++] =
                  (BVMFrame){ .return_pc  = (uint32_t)(pc - bvm->program->bytecode + 1),
                              .env_idx    = bvm->current_env,
                              .stack_base = bvm->stack.top };

                bvm->current_env = env_idx;
                pc               = code_start + proc->entry_pc;

                break;
            }

            default: {
                fprintf(stderr, "unknown opcode: %u\n", pc->opcode);
                bvm->error = 1;
                break;
            }
        }
    }
}

int main(int argc, char* argv[]) {
    if (argc <= 1) {
        fprintf(stderr, "usage: bvm [file]\n");
        exit(EXIT_SUCCESS);
    }

    BVMProgram bvm_program;
    BVM        bvm;

    const char* path = argv[1];
    size_t      bin_size;
    char*       bin = read_file(path, &bin_size);
    init_bvm_program(bin, bin_size, &bvm_program);
    init_bvm(&bvm, &bvm_program);

    execute_bvm(&bvm);

    free_bvm(&bvm);
    free_bvm_program(&bvm_program);
}
