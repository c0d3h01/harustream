# Command runner for the harustream Next.js app.
# Requires `just` (brew install just).

# --- configuration ----------------------------------------------------------
npm := env_var_or_default('NPM', 'npm')
port := env_var_or_default('PORT', '3000')

# --- help -------------------------------------------------------------------
default: help

help:
    @just --list --unsorted

# --- dependencies -----------------------------------------------------------
setup:
    {{npm}} ci

# --- development ------------------------------------------------------------
dev:
    {{npm}} run dev

# --- production build & serve ------------------------------------------------
build:
    {{npm}} run build

start:
    {{npm}} run start -- --port={{port}}

# --- quality gates ------------------------------------------------------------
typecheck:
    {{npm}} run typecheck

lint:
    {{npm}} run lint

lint-fix:
    {{npm}} run lint:fix

format:
    {{npm}} run format

format-check:
    npx biome format .

check:
    {{npm}} run typecheck
    {{npm}} run lint