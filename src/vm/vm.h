#ifndef VM_H
#define VM_H

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define EXIT_FILE_READ 2
#define EXIT_READ_OUT_OF_BOUNDS 3
#define EXIT_INVALID_MAGIC 4

#define BVM_MAGIC 0x544B5242 // BRKT

typedef const enum {
    TAG_INT   = 0x01,
    TAG_FLOAT = 0x02,
    TAG_SYM   = 0x03,
    TAG_STR   = 0x04,
    TAG_BOOL  = 0x05,
    TAG_NIL   = 0x06,
    TAG_PAIR  = 0x07,
    TAG_PROC  = 0x08,
    TAG_IDENT = 0x09,
} BVMDataTag;

typedef const enum {
    S_TAG_SYMBOL_TABLE    = 0x01,
    S_TAG_CONSTANT_POOL   = 0x02,
    S_TAG_PROCEDURE_TABLE = 0x03,
    S_TAG_BYTECODE        = 0x04,
    S_TAG_DEBUG_INFO      = 0x10,
    S_TAG_SOURCE_MAP      = 0x11,
    S_TAG_LINE_INFO       = 0x12,
    S_TAG_TYPE_INFO       = 0x13,
    S_TAG_ATTRIBUTES      = 0x14,
    S_TAG_VENDOR          = 0xFF,
} BVMSectionTag;

typedef const enum {
    OP_RETURN        = 0x00,
    OP_LOAD_CONST    = 0x01,
    OP_LOAD_VAR      = 0x02,
    OP_STORE_VAR     = 0x03,
    OP_JMP           = 0x04,
    OP_JMP_TRUE      = 0x05,
    OP_JMP_FALSE     = 0x06,
    OP_LABEL         = 0x07,
    OP_CALL          = 0x08,
    OP_TAILCALL      = 0x09,
    OP_MAKE_CLOSURE  = 0x0a,
    OP_LOAD_CLOSURE  = 0x0b,
    OP_STORE_CLOSURE = 0x0c,
    OP_POP           = 0x0d,
    OP_HALT          = 0x0e,
    OP_ADD           = 0x0f,
    OP_SUB           = 0x10,
    OP_MUL           = 0x11,
    OP_DIV           = 0x12,
    OP_NEG           = 0x13,
    OP_AND           = 0x14,
    OP_OR            = 0x15,
    OP_NOT           = 0x16,
    OP_XOR           = 0x17,
    OP_CMP_EQ        = 0x18,
    OP_CMP_LT        = 0x19,
    OP_CMP_GT        = 0x1a,
} BVMInstrCode;

typedef struct BVMValue {
    uint8_t tag;
    union {
        int64_t i;
        double  f;
        uint8_t b;

        struct {
            uint32_t sym_id;
        } sym;

        struct {
            uint32_t len;
            char*    data;
        } str;

        struct {
            struct BVMValue* car;
            struct BVMValue* cdr;
        } pair;

        struct {
            uint32_t proc_idx;
            uint32_t env_idx;
        } closure;
    } as;
} BVMValue;

typedef struct {
    uint32_t  parent;
    uint16_t  size;
    BVMValue* slots;
} BVMEnv;

typedef struct {
    uint32_t return_pc;
    uint32_t env_idx;
    uint16_t stack_base;
} BVMFrame;

typedef struct {
    uint32_t  capacity;
    uint32_t  top;
    BVMValue* data;
} BVMStack;

typedef struct {
    const uint8_t* start;
    const uint8_t* cur;
    const uint8_t* end;
} Reader;

typedef struct {
    uint32_t magic;
    uint16_t version;
    uint8_t  word_size;
    uint8_t  flags;
} BVMHeader;

typedef struct {
    uint8_t  tag;
    uint32_t offset;
    uint32_t size;
} BVMSection;

typedef struct {
    uint32_t id;
    uint16_t name_len;
    char*    name;
} BVMSymbolEntry;

typedef struct {
    uint8_t  tag;
    uint16_t size;
    uint8_t* data;
} BVMConstant;

typedef struct {
    uint32_t  entry_pc;
    uint16_t  arity;
    uint16_t  local_count;
    uint16_t  free_count;
    uint32_t* free_vars;
} BVMProcedure;

typedef struct {
    uint8_t      opcode;
    BVMConstant* operand;
} BVMInstruction;

typedef struct {
    uint16_t tag;
    uint32_t size;
    void*    data;
} BVMDebugSubsection;

typedef struct {
    uint16_t            subsection_count;
    BVMDebugSubsection* subsections;
} BVMDebugInfo;

typedef struct {
    uint32_t start_pc;
    uint32_t end_pc;
    uint32_t source_file_id;
    uint32_t procedure_idx;
    uint8_t  flags;
} BVMSourceMapEntry;

typedef struct {
    uint32_t start_pc;
    uint32_t end_pc;
    uint32_t file_id;
    uint32_t start_line;
    uint32_t instruction_count;
    uint8_t* line_program_data;
} BVMLineInfoEntry;

typedef struct {
    BVMHeader          header;
    uint8_t            section_count;
    BVMSection*        sections;
    uint32_t           symbol_count;
    BVMSymbolEntry*    symbols;
    uint32_t           constant_count;
    BVMConstant*       constants;
    uint32_t           procedure_count;
    BVMProcedure*      procedures;
    uint32_t           instruction_count;
    BVMInstruction*    bytecode;
    BVMDebugInfo       debug_info;
    uint32_t           source_map_count;
    BVMSourceMapEntry* source_map;
    uint32_t           line_info_count;
    BVMLineInfoEntry*  line_info;
} BVMProgram;

typedef struct {
    const BVMProgram* program;
    BVMStack          stack;
    uint32_t          frame_count;
    uint32_t          frame_capacity;
    BVMFrame*         frames;
    uint32_t          env_count;
    uint32_t          env_capacity;
    BVMEnv*           envs;
    uint32_t          current_env;
    uint32_t          global_env;
    uint8_t           halted;
    uint8_t           error;
    void*             gc_state;
} BVM;

#endif
