# We cannot use $(shell pwd), which will return unix path format on Windows,
# making it hard to use.
cur_dir = $(dir $(abspath $(firstword $(MAKEFILE_LIST))))

TOP := $(cur_dir)
CUSTOM_RUSTFLAGS := -C debug-assertions
CARGO_ARGS :=
MODE := release
CLANG := $(shell $(TOP)/scripts/find_clang)
CLEAN_BUILD_DIR_FIRST := true
BUILD_DIR := build/$(MODE)
CONTRACT :=

ifeq (release,$(MODE))
	MODE_ARGS := --release
endif

export CUSTOM_RUSTFLAGS
export TOP
export CARGO_ARGS
export MODE
export CLANG
export BUILD_DIR

default: build test

build:
	@if [ "x$(CLEAN_BUILD_DIR_FIRST)" = "xtrue" ]; then \
		echo "Cleaning $(BUILD_DIR) directory..."; \
		rm -rf $(BUILD_DIR); \
	fi
	mkdir -p $(BUILD_DIR)
	@set -eu; \
	if [ "x$(CONTRACT)" = "x" ]; then \
		for contract in $(wildcard contracts/*); do \
			$(MAKE) -e -C $$contract build; \
		done; \
	else \
		$(MAKE) -e -C contracts/$(CONTRACT) build; \
	fi;

test:
	cargo test -p tests $(CARGO_ARGS)

check:
	cargo check $(CARGO_ARGS)

clippy:
	cargo clippy $(CARGO_ARGS)

fmt:
	cargo fmt $(CARGO_ARGS)

clean:
	rm -rf build
	cargo clean

prepare:
	rustup target add riscv64imac-unknown-none-elf

.PHONY: build test check clippy fmt clean prepare
