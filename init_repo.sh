#!/bin/bash
rm -rf .git
git init

# Commit 1: Configuration
git add .gitignore .nvmrc Anchor.toml Cargo.toml Cargo.lock Makefile rust-toolchain.toml package.json tsconfig.json fix_ts.js dump-config.ts program-keypair.json package-lock.json
git commit -m "chore: init root workspace and base configuration"

# Commit 2: Documentation
git add docs/ ARCHITECTURE.md FEATURES.md PITCH.md README.md
git commit -m "docs: add project documentation and architecture"

# Commit 3: Smart Contracts
git add programs/ tests/
git commit -m "feat(programs): init core smart contracts and anchor tests"

# Commit 4: API Backend
git add apps/api/
git commit -m "feat(api): add eclipse prediction markets backend"

# Commit 5: Web Frontend
git add apps/web/
git commit -m "feat(web): add eclipse next.js frontend"

# Commit 6: Scripts & Misc
git add .
git commit -m "chore: add deployment scripts and remaining configs"

git remote add origin https://github.com/shumhn/Eclipse.git
git branch -M main
git push -u origin main -f
