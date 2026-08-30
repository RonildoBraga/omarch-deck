SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

NODE_MODULES := node_modules/.package-lock.json
CONFIG := config.yaml
UDEV_RULE := /etc/udev/rules.d/70-omarch-deck.rules
SERVICE := omarch-deck.service
SERVICE_FILE := $(HOME)/.config/systemd/user/$(SERVICE)
NODE := $(shell command -v node)
PROJECT := $(CURDIR)

.PHONY: help setup install config dev start build check test verify clean \
	diagnose-lights udev-install udev-check \
	install-service uninstall-service service-status service-logs docs

help: ## Show the available commands
	@awk 'BEGIN {FS = ":.*## "; printf "omarch-deck commands:\n\n"} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-14s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: install config ## Install dependencies and create a local config

install: $(NODE_MODULES) ## Install exact dependencies from package-lock.json

$(NODE_MODULES): package.json package-lock.json
	npm ci

config: ## Create config.yaml from the example if it does not exist
	@test -e $(CONFIG) || cp config.example.yaml $(CONFIG)

dev: install config ## Run directly from TypeScript during development
	npm run dev

start: build config ## Build and run the production entry point
	npm start

build: install ## Compile TypeScript to dist/
	npm run build

check: install ## Type-check without producing build output
	npm run check

test: install ## Run the automated tests
	npm test

verify: check test build ## Run all validation required before a handoff

docs: install ## Regenerate docs/index.html from the control tables
	npx tsx scripts/build-docs.ts

diagnose-lights: build ## Cycle and chase all possible CT button LEDs
	npm run diagnose:lights

clean: ## Remove generated build and coverage output
	rm -rf -- dist coverage

install-service: build config ## Install and start the user service so the deck runs at login
	@test -n "$(NODE)" || { printf 'node not found in PATH\n'; exit 1; }
	mkdir -p "$(dir $(SERVICE_FILE))"
	sed -e 's|@NODE@|$(NODE)|g' -e 's|@PROJECT@|$(PROJECT)|g' $(SERVICE).in > "$(SERVICE_FILE)"
	systemctl --user daemon-reload
	systemctl --user enable --now $(SERVICE)
	@printf 'Installed %s\nRun `make service-logs` to follow it.\n' "$(SERVICE_FILE)"

uninstall-service: ## Stop, disable, and remove the user service
	-systemctl --user disable --now $(SERVICE)
	rm -f "$(SERVICE_FILE)"
	systemctl --user daemon-reload

service-status: ## Show whether the user service is running
	systemctl --user --no-pager status $(SERVICE)

service-logs: ## Follow the user service log
	journalctl --user -u $(SERVICE) -f

udev-install: ## Install the Loupedeck permission rule (graphical admin prompt)
	pkexec install -m 0644 70-omarch-deck.rules $(UDEV_RULE)
	pkexec udevadm control --reload-rules
	@printf 'Rule installed. Reconnect the Loupedeck if it is already attached.\n'

udev-check: ## Show the installed rule and current CT serial permissions
	@printf 'Installed rule:\n'
	@test -r $(UDEV_RULE) && sed -n '1,20p' $(UDEV_RULE) || printf '  not installed\n'
	@printf '\nDetected serial devices:\n'
	@for device in /dev/serial/by-id/*Loupedeck*; do \
		test -e "$$device" && ls -l "$$device" || true; \
	done
