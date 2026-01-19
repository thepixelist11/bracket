COMPILER_FLAGS = -Wall -O2
OUTPUT_DIR = bin
OUTPUT_FILE = bvm

all:
	npx tsc
	gcc src/vm/*.c $(COMPILER_FLAGS) -o $(OUTPUT_DIR)/$(OUTPUT_FILE)
