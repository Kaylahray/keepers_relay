cur_dir = $(dir $(abspath $(firstword $(MAKEFILE_LIST))))

TOP := $(cur_dir)
CUSTOM_RUSTFLAGS := -C debug-assertions
# rustc ≥1.95 / LLVM 22: do not use target-feature=-a (breaks bytes AtomicLoadAdd).
# Official fix: https://talk.nervos.org/t/compilation-errors-encountered-when-upgrading-rust-on-chain-script-to-ckb-std-v1-1/10389
# Also: https://github.com/nervosnetwork/ckb-std#upgrading-issues
FULL_RUSTFLAGS := -C target-feature=+zba,+zbb,+zbc,+zbs -C passes=lower-atomic $(CUSTOM_RUSTFLAGS)
CARGO_ARGS :=
MODE := release
CLANG := $(shell $(TOP)/scripts/find_clang)
AR := $(subst clang,llvm-ar,$(CLANG))
OBJCOPY := $(subst clang,llvm-objcopy,$(CLANG))
BUILD_DIR :=
BINARIES := $(notdir $(shell pwd))

ifeq (release,$(MODE))
	MODE_ARGS := --release
endif

default: build

build:
	RUSTFLAGS="$(FULL_RUSTFLAGS)" TARGET_CC="$(CLANG)" TARGET_AR="$(AR)" \
		cargo build --target=riscv64imac-unknown-none-elf $(MODE_ARGS) $(CARGO_ARGS)
	@set -eu; \
	if [ "x$(BUILD_DIR)" != "x" ]; then \
		for binary in $(BINARIES); do \
			echo "Copying binary $$binary to build directory"; \
			cp $(TOP)/target/riscv64imac-unknown-none-elf/$(MODE)/$$binary $(TOP)/$(BUILD_DIR); \
			cp $(TOP)/$(BUILD_DIR)/$$binary $(TOP)/$(BUILD_DIR)/$$binary.debug; \
			$(OBJCOPY) --strip-debug --strip-all $(TOP)/$(BUILD_DIR)/$$binary; \
		done \
	fi

prepare:
	rustup target add riscv64imac-unknown-none-elf

.PHONY: build prepare
