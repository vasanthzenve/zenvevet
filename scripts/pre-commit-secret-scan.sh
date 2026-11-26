#!/bin/bash
# ==============================================================================
# Zenve Vet Git Pre-Commit Secret Scanner Hook
# Automatically blocks commits containing secrets, credentials, and backups
# ==============================================================================

echo "========================================================"
echo " [Zenve Vet] Running Pre-Commit Git Secret Scan...      "
echo "========================================================"

STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED_FILES" ]; then
    exit 0
fi

FAILED=0

# 1. Check for forbidden file names and extensions
FORBIDDEN_PATTERNS=(
    "\.env$"
    "\.env\.(?!example).*"
    "\.sql$"
    "\.dump$"
    "\.key$"
    "\.pem$"
    "\.p12$"
    "\.jks$"
    "credentials\.json$"
    "id_rsa"
    "id_ed25519"
)

for file in $STAGED_FILES; do
    for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
        if echo "$file" | grep -Eq "$pattern"; then
            echo " [BLOCKED] Sensitive file staged for commit: $file"
            FAILED=1
        fi
    done
done

# 2. Check for secret tokens and private keys inside staged file contents
SECRET_SIGNATURES=(
    "BEGIN RSA PRIVATE KEY"
    "BEGIN OPENSSH PRIVATE KEY"
    "BEGIN PRIVATE KEY"
    "AKIA[0-9A-Z]{16}"
    "ghp_[0-9a-zA-Z]{36}"
    "xox[baprs]-[0-9a-zA-Z]{10,48}"
)

for file in $STAGED_FILES; do
    if [ -f "$file" ]; then
        for sig in "${SECRET_SIGNATURES[@]}"; do
            if git diff --cached "$file" | grep -Eq "$sig"; then
                echo " [BLOCKED] Staged diff in $file matches secret pattern: $sig"
                FAILED=1
            fi
        done
    fi
done

if [ $FAILED -ne 0 ]; then
    echo "========================================================"
    echo " COMMIT REJECTED: Sensitive secrets detected in commit! "
    echo " Please unstage with: git reset HEAD <file>             "
    echo "========================================================"
    exit 1
fi

echo " [PASS] Pre-commit secret check passed cleanly."
exit 0
