#ifndef ARRAY_H
#define ARRAY_H

#include "vm.h"
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>

#define ARRAY_GROW_FACTOR 2

#define ARRAY(type)      \
    struct {             \
        type*  data;     \
        size_t length;   \
        size_t capacity; \
    }

#define GROW_CAP(capacity) ((capacity) < 8 ? 8 : (capacity) * ARRAY_GROW_FACTOR)

#define GROW_ARR(type, ptr, old_count, new_count) \
    (type*)reallocate(ptr, sizeof(type) * (old_count), sizeof(type) * (new_count))

#define FREE_ARRAY(type, ptr, old_count) reallocate(ptr, sizeof(type) * (old_count), 0)

void* reallocate(void* ptr, size_t old_size, size_t new_size);

typedef ARRAY(uint8_t) array_uint8_t;
void array_uint8_t_push(array_uint8_t* array, uint8_t val);
void array_uint8_t_init(array_uint8_t* array);
void array_uint8_t_free(array_uint8_t* array);

typedef ARRAY(void*) array_ptr;
void array_ptr_push(array_ptr* array, void* val);
void array_ptr_init(array_ptr* array);
void array_ptr_free(array_ptr* array);

typedef ARRAY(BVMConstant) array_const;
void array_const_push(array_const* array, BVMConstant val);
void array_const_init(array_const* array);
void array_const_free(array_const* array);

#endif
